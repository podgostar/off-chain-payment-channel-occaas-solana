const Web3 = require("@solana/web3.js");
const borsh = require("borsh");
const Nacl = require("tweetnacl");
const Base58 = require("base-58");
const marky = require('marky');

const configuration = require("./configuration.js");
const connection = configuration.connection;

const sender_keypair = Web3.Keypair.fromSecretKey(Uint8Array.from(configuration.stakeholder1_private_key));
const receiver_public_key = configuration.stakeholder2_public_key;

const amount = configuration.tx_amount;
const number_of_transactions = configuration.num_of_tx_to_be_tested;

const main = async (sender, receiver, amount) => {

    console.log("Sender:", sender.publicKey.toString());
    console.log("Receiver:", receiver.toString());
    console.log("Amount:", amount);

    marky.mark("onchain");

    for (let i = 0; i < number_of_transactions; i++) {

        const transaction = new Web3.Transaction().add(
            Web3.SystemProgram.transfer({
                fromPubkey: sender.publicKey,
                toPubkey: receiver,
                lamports: amount
            })
        );

        const tx = await Web3.sendAndConfirmTransaction(connection, transaction, [sender]);
        console.log(tx);
        console.log(marky.stop('onchain').duration)
    }
};

main(sender_keypair, receiver_public_key, amount);
