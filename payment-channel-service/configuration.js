const Web3 = require("@solana/web3.js");

const network_name = 'insert network name here';
const program_id = 'insert program id here'

const oracle_private_key = // insert oracle private key here

const connection = new Web3.Connection(Web3.clusterApiUrl(network_name), 'confirmed')
const oracle_public_key = Web3.Keypair.fromSecretKey(Uint8Array.from(oracle_private_key)).publicKey.toBase58()

// IPFS connection parameters
const host = "insert IPFS host here";
const port = 'insert IPFS port here';
const protocol = "insert IPFS protocol here";

module.exports = {
    program_id,
    oracle_private_key,
    oracle_public_key,
    connection,
    host,
    port,
    protocol
}
