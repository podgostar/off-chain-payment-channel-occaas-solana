const Web3 = require("@solana/web3.js");
const borsh = require("borsh");
const Nacl = require("tweetnacl");
const Base58 = require("base-58");

const configuration = require("./configuration.js");
const oracle_channel = require("../payment-channel-service/oracle.js");
const connection = configuration.connection;

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

    console.log("Opening channel " + channelid + " with " + amount + " tokens" + " for " + stakeholder_keypair.publicKey)    

    try {
        // Static variables
        const prev_state = "0";
        const action = 1;

        // Schemas
        const open_token_core_data_schema_sender = new Map([[Data, {
            kind: 'struct',
            fields: [
                ['action', 'u8'],
                ['channelid', 'string'],
                ['address', [32]],
                ['balance', 'u64'],
                ['sender', [32]],
            ]
        }]]);

        const pre_open_token_schema_sig_sender = new Map([[Data, {
            kind: 'struct',
            fields: [
                ['encoded_data', ["u8"]],
                ['prev_state', 'string'],
                ['sig_sender', [64]],
            ]
        }]]);

        const open_token_schema = new Map([[Data, {
            kind: 'struct',
            fields: [
                ['encoded_data', ["u8"]],
                ['prev_state', 'string'],
                ['sig_oracle', [64]]
            ]
        }]]);

        const open_token_core_data_schema_oracle = new Map([[Data, {
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

        // Blockchain instruction schema
        const instruction_schema_open_channel = new Map([[InstructionPayload, {
            kind: 'struct',
            fields: [
                ['variant', 'u8'],
                ['open_token_encoded', ["u8"]], // STRING!!
            ],
        }],
        ]);

        let open_token_core_data_sender = new Data(
            {
                action: action,
                channelid: channelid,
                address: stakeholder_keypair.publicKey.toBytes(),
                balance: amount,
                sender: stakeholder_keypair.publicKey.toBytes(),
            }
        );

        const open_token_core_data_encoded = borsh.serialize(open_token_core_data_schema_sender, open_token_core_data_sender); // buffer is returned

        const sig_sender_open = Nacl.sign.detached(Uint8Array.from(open_token_core_data_encoded), stakeholder_keypair.secretKey);

        let pre_open_token_data_sig_sender = new Data(
            {
                encoded_data: open_token_core_data_encoded,
                prev_state: prev_state,
                sig_sender: sig_sender_open,
            }
        );

        let pre_open_token_encoded_sender = borsh.serialize(pre_open_token_schema_sig_sender, pre_open_token_data_sig_sender);

        // CALL ORACLE FOR OPEN CHANNEL TOKEN
        const open_token_encoded = await oracle_channel.open(pre_open_token_encoded_sender)

        const open_token_decoded = borsh.deserialize(open_token_schema, Data, open_token_encoded);

        // compose data for signature verification
        let open_token_core_data_for_sig_verification = new Data(
            {
                action: action,
                channelid: channelid,
                address: stakeholder_keypair.publicKey.toBytes(),
                balance: amount,
                sender: stakeholder_keypair.publicKey.toBytes(),
                sig_sender: sig_sender_open
            }
        );

        // // serialize it
        const open_token_core_data_encoded_for_sig_verification = borsh.serialize(open_token_core_data_schema_oracle, open_token_core_data_for_sig_verification); // buffer is returned

        // verify oracle signature 
        const verify_oracle_sig = Nacl.sign.detached.verify(
            open_token_core_data_encoded_for_sig_verification,
            open_token_decoded.sig_oracle,
            Base58.decode(oracle_public_key));

        if (!verify_oracle_sig) {
            console.log('Oracle signature is not valid!');
            return;
        }

        let open_channel_data_instuction_payload = new InstructionPayload({
            variant: 1,
            open_token_encoded: open_token_encoded 
        });

        const open_channel_instruction_buffer = borsh.serialize(instruction_schema_open_channel, open_channel_data_instuction_payload);

        const transaction = new Web3.Transaction();

        // DERIVING PDA's
        const pda_channel = Web3.PublicKey.findProgramAddressSync([Buffer.from(channelid)], program_pubkey);
        const pda_stakeholder = Web3.PublicKey.findProgramAddressSync([Buffer.from(channelid), stakeholder_keypair.publicKey.toBuffer()], program_pubkey);
        const pda_oracle = Web3.PublicKey.findProgramAddressSync([Buffer.from(Base58.decode(oracle_public_key))], program_pubkey) 

        const verify_oracle_sig_instruction = Web3.Ed25519Program.createInstructionWithPublicKey({
            publicKey: Base58.decode(oracle_public_key), 
            message: Uint8Array.from(open_token_core_data_encoded_for_sig_verification),
            signature: open_token_decoded.sig_oracle,
        })
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
            data: open_channel_instruction_buffer,
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



