const Web3 = require("@solana/web3.js");

const network_name = 'insert network name here';
const program_id = 'insert program id here'

const connection = new Web3.Connection(Web3.clusterApiUrl(network_name), 'confirmed')
const oracle_public_key = // insert oracle public key here 

const ipfs_config = {
    host: "insert IPFS host here",
    port: 'insert IPFS port here',
    protocol: "insert IPFS protocol here",
}

module.exports = {
    program_id,
    oracle_public_key,
    connection,
    ipfs_config
}
