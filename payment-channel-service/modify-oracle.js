const Web3 = require("@solana/web3.js");
const Base58 = require("base-58");
const borsh = require("borsh");

const configuration = require("./configuration.js");
const connection = configuration.connection;

// PROGRAM DATA
const program_address = configuration.program_id;
const program_pubkey = new Web3.PublicKey(program_address);

const oracle_keypair = Web3.Keypair.fromSecretKey(Uint8Array.from(configuration.oracle_private_key));

const main = async () => {

    class Assignable {
        constructor(properties) {
            Object.keys(properties).map((key) => {
                this[key] = properties[key];
            });
        }
    }

    class InstructionPayload extends Assignable {
    }

    const modify_oracle_schema = new Map([[InstructionPayload, {
        kind: 'struct',
        fields: [
            ['variant', 'u8'],
            ['oracle_address', [32]]]
    }]]);

    let modify_oracle_instruction_payload = new InstructionPayload({
        variant: 5,
        oracle_address: oracle_keypair.publicKey.toBytes()
    });

    const modify_oracle_instruction_buffer = borsh.serialize(modify_oracle_schema, modify_oracle_instruction_payload);

    const transaction = new Web3.Transaction();

    const pda_oracle = Web3.PublicKey.findProgramAddressSync([oracle_keypair.publicKey.toBuffer()],
        program_pubkey);

    const instruction = new Web3.TransactionInstruction({
        keys: [
            {
                pubkey: oracle_keypair.publicKey, // msg.sender
                isSigner: true,
                isWritable: false,
            },
            {
                pubkey: pda_oracle[0],
                isSigner: false,
                isWritable: true
            },
            {
                pubkey: Web3.SystemProgram.programId,
                isSigner: false,
                isWritable: false
            }
        ],
        data: modify_oracle_instruction_buffer,
        programId: program_pubkey
    })

    transaction.add(instruction);

    const tx = await Web3.sendAndConfirmTransaction(
        connection,
        transaction,
        [oracle_keypair]
    )

    console.log('Transaction:', tx)

}

main();
