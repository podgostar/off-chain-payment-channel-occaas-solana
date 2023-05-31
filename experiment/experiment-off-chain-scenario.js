const Web3 = require("@solana/web3.js");
const borsh = require("borsh");
const Nacl = require("tweetnacl");
const Base58 = require("base-58");
const marky = require('marky');

const open_client = require("../payment-channel-client/open-channel-client.js");
const invite_client = require("../payment-channel-client/invite-channel-client.js");
const join_client = require("../payment-channel-client/join-channel_client.js");
const update_client = require("../payment-channel-client/update-channel-client.js");
const leave_client = require("../payment-channel-client/leave-channel-client.js");

const configuration = require("./configuration.js");
const connection = configuration.connection;

// Provide credentials of stakeholders and oracle (for testing/experiment/simulation purposes only)
const stakeholder_a_keypair = Web3.Keypair.fromSecretKey(Uint8Array.from(configuration.stakeholder1_private_key));
const stakeholder_a_public_key = configuration.stakeholder1_public_key;
const stakeholder_b_keypair = Web3.Keypair.fromSecretKey(Uint8Array.from(configuration.stakeholder2_private_key));
const stakeholder_b_public_key = configuration.stakeholder2_public_key;
const stakeholder_c_keypair = Web3.Keypair.fromSecretKey(Uint8Array.from(configuration.stakeholder3_private_key));
const stakeholder_c_public_key = configuration.stakeholder3_public_key;

// Insert channel information
const channel_id = configuration.channel_id;
const open_amount = configuration.open_amount;
const tx_amount = configuration.tx_amount;

// TEST PARAMETERS
const intermediate_times = configuration.intermediate_times;

const test_case = async (channel_id, sender_keypair, receiver_public_key, tx_amount, test_time) => {

    try {
        let number_of_transactions = 0;
        marky.mark("offchain");
        while (true) {
            if (marky.stop("offchain").duration < test_time) {
                await update_client.main(channel_id, sender_keypair, tx_amount, receiver_public_key);
                number_of_transactions += 1;
            } else
                break;
        }
        return Promise.resolve(number_of_transactions);
    } catch (error) {
        return Promise.reject(error);
    }
}

const main = async () => {
    
    // ------- Stakeholder A opens the channel -------- //
    
    // await open_client.main(channel_id, stakeholder_a_keypair, open_amount)

    // ------- Stakeholder B joins the channel -------- //
    
    // await invite_client.main(channel_id, stakeholder_a_keypair, stakeholder_b_public_key);

    
    // ------- Stakeholder B joins the channel -------- //
    
    // await join_client.main(channel_id, stakeholder_b_keypair, open_amount);


    // ------- Stakeholder A performs 10 "on-chain txs" off-chain txs towards Stakeholder B -------- //

    // let number_of_transactions_total = 0;
    // let last_time = 0;
    // for (const time of intermediate_times) {
    //     const run_time = time - last_time;
    //     last_time = time;
    //     const number_of_performed_transactions = await test_case(channel_id, stakeholder_a_keypair, stakeholder_b_public_key, tx_amount, run_time);
    //     number_of_transactions_total += number_of_performed_transactions;
    //     console.log(number_of_transactions_total)
    // }
    // console.log('Number of performed transactions: ', number_of_transactions_total);

    // ------- Stakeholder B invites Stakeholder C -------- //

    // await invite_client.main(channel_id, stakeholder_b_keypair, stakeholder_c_public_key);

    // ------- Stakeholder A leaves the channel -------- //
    
    // await leave_client.main(channel_id, stakeholder_a_keypair);

    // ------- Stakeholder C joins the channel -------- //
    
    // await join_client.main(channel_id, stakeholder_c_keypair, open_amount);

    // ------- Stakeholder B performs 2 off-chain txs towards Stakeholder C -------- //
    
    // await update_client.main(channel_id, stakeholder_b_keypair, tx_amount, stakeholder_c_public_key);
    // await update_client.main(channel_id, stakeholder_b_keypair, tx_amount, stakeholder_c_public_key);

    // ------- Stakeholder C leaves the channel -------- //
    
    // await leave_client.main(channel_id, stakeholder_c_keypair);

    // ------- Stakeholder B leaves the channel -------- //
    
    // await leave_client.main(channel_id, stakeholder_b_keypair);

};

main();
