const Web3 = require("@solana/web3.js");
const borsh = require("borsh");
const Nacl = require("tweetnacl");
const Base58 = require("base-58");

const configuration = require("./configuration.js");
const oracle_channel = require("../payment-channel-service/oracle.js");
const state_helper = require('../payment-channel-service/utils/state-helper-oracle.js');

const connection = configuration.connection;

// PROGRAM DATA
const program_address = configuration.program_id;
const program_pubkey = new Web3.PublicKey(program_address);

// ORACLE DATA
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

const main = async (channelid, stakeholder_keypair) => {

    console.log("Leaving channel " + channelid + " for " + stakeholder_keypair.publicKey)

    try {

        const pre_leave_token_core_data_schema = new Map([[Data, {
            kind: 'struct',
            fields: [
                ['action', 'u8'],
                ['channelid', 'string'],
                ['address', [32]],
                ['balance', 'u64'],
                ['sender', [32]],
            ]
        }]]);

        const leave_token_core_data_schema = new Map([[Data, {
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

        const leave_token_schema = new Map([[Data, {
            kind: 'struct',
            fields: [
                ['encoded_data', ["u8"]],
                ['prev_state', 'string'],
                ['sig_oracle', [64]],
            ]
        }]]);

        // Blockchain instruction schema
        const instruction_schema_leave_channel = new Map([[InstructionPayload, {
            kind: 'struct',
            fields: [
                ['variant', 'u8'],
                ['leave_token_encoded', ["u8"]],
            ],
        }],
        ]);

        // get data prepared by oracle
        const pre_leave_data_encoded = await leave_helper(channelid, stakeholder_keypair.publicKey)

        // decode data
        const pre_leave_data_decoded = borsh.deserialize(pre_leave_token_core_data_schema, Data, pre_leave_data_encoded)

        // check data 

        // sign data
        const leave_data_signed_sender = Nacl.sign.detached(pre_leave_data_encoded, stakeholder_keypair.secretKey)

        // encode data
        let leave_token_core_data = new Data({
            action: pre_leave_data_decoded.action,
            channelid: pre_leave_data_decoded.channelid,
            address: pre_leave_data_decoded.address,
            balance: pre_leave_data_decoded.balance,
            sender: pre_leave_data_decoded.sender,
            sig_sender: leave_data_signed_sender,
        });

        const leave_token_code_data_encoded = borsh.serialize(leave_token_core_data_schema, leave_token_core_data);

        // send to oracle
        const leave_token_encoded = await oracle_channel.leave(leave_token_code_data_encoded);

        // decode data
        const leave_token_decoded = borsh.deserialize(leave_token_schema, Data, leave_token_encoded)

        // optionaly decode data, and check if it is correct
        // const leave_token_core_data_decoded = borsh.deserialize(leave_token_core_data_schema, Data, Buffer.from(leave_token_decoded.encoded_data, 'hex'))

        // verify signature
        const verify_oracle_sig = Nacl.sign.detached.verify(Buffer.from(leave_token_decoded.encoded_data, 'hex'), leave_token_decoded.sig_oracle, Base58.decode(oracle_public_key))

        if (!verify_oracle_sig) {
            console.log("Verification of oracle signature failed")
            return;
        }

        let leave_channel_data_instuction_payload = new InstructionPayload({
            variant: 3,
            leave_token_encoded: leave_token_encoded,
        });

        const leave_channel_instruction_buffer = borsh.serialize(instruction_schema_leave_channel, leave_channel_data_instuction_payload);

        const transaction = new Web3.Transaction();

        // DERIVING PDA's
        const pda_channel = Web3.PublicKey.findProgramAddressSync([Buffer.from(channelid)], program_pubkey);
        const pda_stakeholder = Web3.PublicKey.findProgramAddressSync([Buffer.from(channelid), stakeholder_keypair.publicKey.toBuffer()], program_pubkey);
        const pda_oracle = Web3.PublicKey.findProgramAddressSync([Buffer.from(Base58.decode(oracle_public_key))], program_pubkey)

        const verify_oracle_sig_instruction = Web3.Ed25519Program.createInstructionWithPublicKey({
            publicKey: Base58.decode(oracle_public_key),
            message: Uint8Array.from(Buffer.from(leave_token_decoded.encoded_data, 'hex')),
            signature: leave_token_decoded.sig_oracle
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
            data: leave_channel_instruction_buffer,
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

const leave_helper = async (channelid, sender_public_key) => {

    try {

        const action = 4; // off-chain tx
        const sender = sender_public_key.toString();

        const last_off_chain_state = await state_helper.get_last_channel_state(channelid);

        // determine if sender is part of channel (off-chain and on-chain)
        if (!last_off_chain_state.find((item) => item.address === sender)) {
            console.log('Sender not part of channel (off-chain)!')
            return Promise.reject('Sender not part of channel!');
        }

        const sender_balance = last_off_chain_state.find((item) => item.address === sender).balance;

        if (!sender_balance > 0) {
            console.log('Sender does not have enough balance!')
            return Promise.reject('Sender does not have enough balance!');
        }

        const pre_leave_token_core_data_schema = new Map([[Data, {
            kind: 'struct',
            fields: [
                ['action', 'u8'],
                ['channelid', 'string'],
                ['address', [32]],
                ['balance', 'u64'],
                ['sender', [32]],
            ]
        }]]);

        let pre_leave_token_core_data = new Data({
            action,
            channelid,
            address: sender_public_key.toBytes(),
            balance: sender_balance,
            sender: sender_public_key.toBytes(),
        });

        const pre_leave_token_core_data_encoded = borsh.serialize(pre_leave_token_core_data_schema, pre_leave_token_core_data);

        return Promise.resolve(pre_leave_token_core_data_encoded);

    } catch (error) {
        console.log(error);
        return Promise.reject(error);
    }
}

module.exports = {
    main,
    leave_helper
}





