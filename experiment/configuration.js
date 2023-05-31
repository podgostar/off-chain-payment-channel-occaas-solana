/* 
const Web3 = require("@solana/web3.js");

const network_name = 'insert-network-name-here';
const program_id = 'insert-program-id-here';

const oracle_private_key = // insert oracle private key here

const stakeholder1_private_key = // insert stakeholder 1 (User A) private key here
const stakeholder2_private_key = // insert stakeholder 2 (User B) private key here
const stakeholder3_private_key = // insert stakeholder 3 (User C) private key here


const connection = new Web3.Connection(Web3.clusterApiUrl(network_name), 'confirmed')
const oracle_public_key = Web3.Keypair.fromSecretKey(Uint8Array.from(oracle_private_key)).publicKey.toBase58() 
const stakeholder1_public_key = Web3.Keypair.fromSecretKey(Uint8Array.from(stakeholder1_private_key)).publicKey.toBase58() 
const stakeholder2_public_key = Web3.Keypair.fromSecretKey(Uint8Array.from(stakeholder2_private_key)).publicKey.toBase58()
const stakeholder3_public_key = Web3.Keypair.fromSecretKey(Uint8Array.from(stakeholder3_private_key)).publicKey.toBase58()

const ipfs_config = {
    host: // insert IPFS host here,
    port: // insert IPFS port here,
    protocol: // insert IPFS protocol here,
}

// CHANNEL PARAMETERS
const channel_id = // insert channel id here
const open_amount = // insert open amount here
const join_amount = // insert join amount here
const tx_amount = // insert transaction amount here;

// ON-CHAIN EXPERIMENT PARAMETERS
const num_of_tx_to_be_tested = // insert number of transactions to be tested here

// ON-CHAIN TIMESTAMPS OF TRANSACTIONS
const intermediate_times = [
// insert timestamps of transactions here
];

module.exports = {
    program_id,
    channel_id,
    oracle_private_key,
    oracle_public_key,
    stakeholder1_private_key,
    stakeholder2_private_key,
    stakeholder3_private_key,
    stakeholder1_public_key,
    stakeholder2_public_key,
    stakeholder3_public_key,
    connection,
    ipfs_config,
    open_amount,
    join_amount,
    tx_amount,
    num_of_tx_to_be_tested,
    intermediate_times,
}
*/