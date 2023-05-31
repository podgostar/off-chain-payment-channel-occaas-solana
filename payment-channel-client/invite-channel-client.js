const Web3 = require("@solana/web3.js");
const borsh = require("borsh");
const Base58 = require("base-58");

const configuration = require("./configuration.js");

const connection = configuration.connection;

// PROGRAM DATA
const program_address = configuration.program_id;
const program_pubkey = new Web3.PublicKey(program_address);

class Assignable {
    constructor(properties) {
        Object.keys(properties).map((key) => {
            this[key] = properties[key];
        });
    }
}

class InstructionPayload extends Assignable {
}

const main = async (channelid, stakeholder_keypair, invitee) => {

    console.log("Inviting " + invitee + " to channel " + channelid)

    try {
       
        // Blockchain instruction schema
        const instruction_schema_invite = new Map([[InstructionPayload, {
            kind: 'struct',
            fields: [
                ['variant', 'u8'],
                ['channel_id', 'string'],
                ['invitee', [32]],
            ],
        }],
        ]);

        let invite_instuction_payload = new InstructionPayload({
            variant: 6,
            channel_id: channelid,
            invitee:  Base58.decode(invitee),
        });

        const invite_instruction_buffer = borsh.serialize(instruction_schema_invite, invite_instuction_payload);

        const transaction = new Web3.Transaction();

        // DERIVING PDA's
        const pda_channel = Web3.PublicKey.findProgramAddressSync([Buffer.from(channelid)], program_pubkey);
        const pda_stakeholder = Web3.PublicKey.findProgramAddressSync([Buffer.from(channelid), stakeholder_keypair.publicKey.toBuffer()], program_pubkey);
        const pda_invitee = Web3.PublicKey.findProgramAddressSync([Buffer.from(channelid), Buffer.from(Base58.decode(invitee))], program_pubkey);

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
                    pubkey: pda_invitee[0],
                    isSigner: false,
                    isWritable: true,
                },
                {
                    pubkey: Web3.SystemProgram.programId,
                    isSigner: false,
                    isWritable: false
                }
            ],
            data: invite_instruction_buffer,
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





