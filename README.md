# Experimenting with OCCaaS-based off-chain payment channel utilizing Solana platform

### Prerequisites

```
NodeJS (v18+)
3 running (private-network) IPFS/IPNS nodes
Solana testnet RPC and WS endpoints
4 Solana testnet accounts (with some funds) and access to their credentials
```

### Installing, configuring, and running the experiment


Clone this repo:

```
git clone off-chain-payment-channel-occaas-solana
```

Build and deploy smart contracts (.\payment-channel-smart-contracts\). For demonstration purposes, this can be done using Solana IDE (https://beta.solpg.io/) -> ```Program ID``` is returned. 

Please make sure smart contracts are being deployed with an Oracle account and that they are accurately configured (see modify_oracle_processor.rs).

```
/ Get accounts
    let initializer = next_account_info(account_info_iter)?; // -> oracle account here
    let oracle_state_account = next_account_info(account_info_iter)?;
    let system_program = next_account_info(account_info_iter)?;

    // Hardcoded "owner" public key
    let initial_owner_string =
        Pubkey::from_str("ADDRESS-OF-ORACLE-HERE").unwrap();
```

Inside folder, run:

```
npm i
```

Set values in .\payment-channel-service\configuration.js e
```
const network_name = 'insert network name here';
const program_id = 'insert program id here'

const oracle_private_key = // insert oracle private key here

// IPFS connection parameters
const host = "insert IPFS host here";
const port = 'insert IPFS port here';
const protocol = "insert IPFS protocol here";
```

Set values in .\payment-channel-client\configuration.js
```
const network_name = 'insert network name here';
const program_id = 'insert program id here'
const oracle_public_key = // insert oracle public key here 

const ipfs_config = {
    host: "insert IPFS host here",
    port: 'insert IPFS port here',
    protocol: "insert IPFS protocol here",
}
```

Set values in .\experiment\configuration.js

```
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
const num_of_tx_to_be_tested = // insert number of transactions to be tested here (usualy 10)
```

To start **on-chain** part of the experiment, inside folder, run:

```
node .\experiment\experiment-on-chain-scenario.js
```

Based on results, set values in .\experiment\configuration.js
```
// ON-CHAIN TIMESTAMPS OF TRANSACTIONS
const intermediate_times = [
// insert the timestamps of the transactions here
];
```

To start event listener, inside folder, run:

```
node .\payment-channel-service\event-listener.js
```

**(in multiple rounds)** To run **off-chain** part of the experiment, inside the folder, comment and uncomment relevant (for order see below) lines of code, and run:

```
node .\experiment\experiment-off-chain-scenario.js 
```

Order of the off-chain experiment steps, denoting which lines of code above-specified comment should be uncommented when running the off-chain experiment command (in rounds)
```
1. // ------- Stakeholder A opens the channel -------- //
2. // ------- Stakeholder B joins the channel -------- //
3. // ------- Stakeholder B joins the channel -------- //
4. // ------- Stakeholder A performs 10 "on-chain txs" off-chain txs towards Stakeholder B -------- //
5. // ------- Stakeholder B invites Stakeholder C -------- //
6. // ------- Stakeholder A leaves the channel -------- //
7. // ------- Stakeholder C joins the channel -------- //
8. // ------- Stakeholder B performs 2 off-chain txs towards Stakeholder C -------- //
9. // ------- Stakeholder C leaves the channel -------- //
10. // ------- Stakeholder B leaves the channel -------- //
```
