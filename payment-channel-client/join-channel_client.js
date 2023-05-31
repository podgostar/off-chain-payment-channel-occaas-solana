const Web3 = require("@solana/web3.js");
const borsh = require("borsh");
const Nacl = require("tweetnacl");
const Base58 = require("base-58");

const configuration = require("./configuration.js");

const connection = configuration.connection;

const oracle_channel = require("../payment-channel-service/oracle.js");

// PROGRAM DATA
const program_address = configuration.program_id;
const program_pubkey = new Web3.PublicKey(program_address);

const oracle_public_key = configuration.oracle_public_key;

class Assignable {
    constructor(properties) {
        Object.keys(properties).map((key) => {
            this[key] = properties[key];
        });
    }
}

class InstructionPayload extends Assignable {
}

class Data extends Assignable {
}


const main = async (channelid, stakeholder_keypair, amount) => {

    console.log("Joining channel with id: " + channelid);
    console.log('Stakeholder: ', stakeholder_keypair.publicKey.toBase58());

    try {

        const prev_state = "0";
        const action = 2;

        const join_token_core_data_schema_sender = new Map([[Data, {
            kind: 'struct',
            fields: [
                ['action', 'u8'],
                ['channelid', 'string'],
                ['address', [32]],
                ['balance', 'u64'],
                ['sender', [32]],
            ]
        }]]);

        const pre_join_token_schema_sig_sender = new Map([[Data, {
            kind: 'struct',
            fields: [
                ['encoded_data', ["u8"]],
                ['prev_state', 'string'],
                ['sig_sender', [64]],
            ]
        }]]);

        const join_token_core_data_schema_oracle = new Map([[Data, {
            kind: 'struct',
            fields: [
                ['action', 'u8'],
                ['channelid', 'string'],
                ['address', [32]],
                ['balance', 'u64'],
                ['sender', [32]],
                ['sig_sender', [64]],
            ]
        }]]);

        const join_token_schema = new Map([[Data, {
            kind: 'struct',
            fields: [
                ['encoded_data', ["u8"]],
                ['prev_state', 'string'],
                ['sig_oracle', [64]]
            ]
        }]]);


        // Blockchain instruction schema
        const instruction_schema_join_channel = new Map([[InstructionPayload, {
            kind: 'struct',
            fields: [
                ['variant', 'u8'],
                ['join_token_encoded', ["u8"]],
            ],
        }],
        ]);

        let join_token_core_data_sender = new Data(
            {
                action: action,
                channelid: channelid,
                address: stakeholder_keypair.publicKey.toBytes(),
                balance: amount,
                sender: stakeholder_keypair.publicKey.toBytes(),
            }
        );

        let join_token_core_data_sender_encoded = borsh.serialize(join_token_core_data_schema_sender, join_token_core_data_sender);
        const sig_sender_join = Nacl.sign.detached(join_token_core_data_sender_encoded, stakeholder_keypair.secretKey);

        let pre_join_token_sig_sender = new Data(
            {
                encoded_data: join_token_core_data_sender_encoded,
                prev_state: prev_state,
                sig_sender: sig_sender_join,
            }
        );

        let pre_join_token_sig_sender_encoded = borsh.serialize(pre_join_token_schema_sig_sender, pre_join_token_sig_sender);

        // Call oracle
        const join_token_encoded = await oracle_channel.join(pre_join_token_sig_sender_encoded);
        const join_token_decoded = borsh.deserialize(join_token_schema, Data, join_token_encoded);


        let join_token_core_data_for_sig_verification = new Data(
            {
                action: action,
                channelid: channelid,
                address: stakeholder_keypair.publicKey.toBytes(),
                balance: amount,
                sender: stakeholder_keypair.publicKey.toBytes(),
                sig_sender: sig_sender_join,
            }
        );

        let join_token_core_data_for_sig_verification_encoded = borsh.serialize(join_token_core_data_schema_oracle, join_token_core_data_for_sig_verification);
        
        // verify oracle signature 
        const verify_oracle_sig = Nacl.sign.detached.verify(
            join_token_core_data_for_sig_verification_encoded,
            join_token_decoded.sig_oracle,
            Base58.decode(oracle_public_key));

        if (!verify_oracle_sig) {
            console.log('Oracle signature is not valid!');
            return;
        } 

        let join_instuction_payload = new InstructionPayload(
            {
                variant: 2,
                join_token_encoded: join_token_encoded,
            }
        );

        const join_instruction_buffer = borsh.serialize(instruction_schema_join_channel, join_instuction_payload);

        const transaction = new Web3.Transaction();

        // DERIVING PDA's
        const pda_channel = Web3.PublicKey.findProgramAddressSync([Buffer.from(channelid)], program_pubkey);
        const pda_stakeholder = Web3.PublicKey.findProgramAddressSync([Buffer.from(channelid), stakeholder_keypair.publicKey.toBuffer()], program_pubkey);
        const pda_oracle = Web3.PublicKey.findProgramAddressSync([Buffer.from(Base58.decode(oracle_public_key))], program_pubkey) 

        const verify_oracle_sig_instruction = Web3.Ed25519Program.createInstructionWithPublicKey({
            publicKey: Base58.decode(oracle_public_key),
            message: Uint8Array.from(join_token_core_data_for_sig_verification_encoded),
            signature: join_token_decoded.sig_oracle, 
        });

        transaction.add(verify_oracle_sig_instruction);

        const instruction = new Web3.TransactionInstruction({
            keys: [
                {
                    pubkey: stakeholder_keypair.publicKey,
                    isSigner: true,
                    isWritable: false,
                },
                {
                    pubkey: pda_channel[0],
                    isSigner: false,
                    isWritable: true
                },
                {
                    pubkey: pda_stakeholder[0],
                    isSigner: false,
                    isWritable: true,
                },
                {
                    pubkey: pda_oracle[0],
                    isSigner: false,
                    isWritable: true,
                },
                {
                    pubkey: Web3.SYSVAR_INSTRUCTIONS_PUBKEY,
                    isSigner: false,
                    isWritable: false,
                },
                {
                    pubkey: Web3.SystemProgram.programId,
                    isSigner: false,
                    isWritable: false
                }
            ],
            data: join_instruction_buffer,
            programId: program_pubkey
        })

        transaction.add(instruction);

        const tx = await Web3.sendAndConfirmTransaction(connection, transaction, [stakeholder_keypair]);
        console.log(tx)
        return Promise.resolve(tx);

    } catch (error) {
        console.log(error)
        return Promise.reject(error);
    }

}

module.exports = {
    main
}






