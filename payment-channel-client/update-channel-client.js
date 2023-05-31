const Web3 = require("@solana/web3.js");
const borsh = require("borsh");
const Nacl = require("tweetnacl");
const Base58 = require("base-58");

const configuration = require("./configuration.js");
const state_helper = require('../payment-channel-service/utils/state-helper-oracle.js');
const oracle_channel = require("../payment-channel-service/oracle.js");

// ORACLE DATA
const oracle_public_key = configuration.oracle_public_key;

class Assignable {
    constructor(properties) {
        Object.keys(properties).map((key) => {
            this[key] = properties[key];
        });
    }
}

class Data extends Assignable {
}

const main = async (channelid, sender_keypair, amount, receiver_public_key) => {

    try {

        const num_of_participants_schema = new Map([
            [Data, { kind: 'struct', fields: [['num_of_stakeholders', 'u8']] }]
        ]);

        const pre_off_chain_tx_oracle_encoded = await update_helper(channelid, sender_keypair.publicKey, amount, receiver_public_key)

        const data = borsh.deserialize(num_of_participants_schema, Data, Buffer.from(pre_off_chain_tx_oracle_encoded, 'hex').slice(Buffer.from(pre_off_chain_tx_oracle_encoded, 'hex').length - 1));

        // reconstruct schema
        // Generate schema
        const fields = [
            ['action', 'u8'],
            ['channelid', 'string']
        ];
        for (let i = 1; i <= data.num_of_stakeholders; i++) {
            fields.push([`address${i}`, [32]]);
            fields.push([`balance${i}`, 'u64']);
        }
        fields.push(['sender', [32]]);
        fields.push(['num_of_stakeholders', 'u8']);

        const off_chain_token_data_schema = new Map([[Data, {
            kind: 'struct',
            fields
        }]]);

        // optional: decode data and check if it is correct
        // const off_chain_token_data_decoded = borsh.deserialize(off_chain_token_data_schema, Data, Buffer.from(pre_off_chain_tx_oracle_encoded, 'hex'));
        // console.log('off_chain_token_data: ', off_chain_token_data_decoded);

        // sign data
        const off_chain_token_data_signed = Nacl.sign.detached(Buffer.from(pre_off_chain_tx_oracle_encoded, 'hex'), sender_keypair.secretKey);

        const pre_tx_token_schema_sig_sender = new Map([[Data, {
            kind: 'struct',
            fields: [
                ['encoded_data', ["u8"]],
                ['prev_state', 'string'],
                ['sig_sender', [64]],
            ]
        }]]);

        const pre_tx_token_data_sig_sender = new Data({
            encoded_data: Buffer.from(pre_off_chain_tx_oracle_encoded, 'hex'),
            prev_state: "0",
            sig_sender: off_chain_token_data_signed
        });

        // encode data
        const pre_tx_token_data_sig_sender_encoded = borsh.serialize(pre_tx_token_schema_sig_sender, pre_tx_token_data_sig_sender);

        // send to oracle
        const tx = oracle_channel.update(pre_tx_token_data_sig_sender_encoded, sender_keypair.publicKey, amount, receiver_public_key)
        return Promise.resolve(tx);
        
    } catch (error) {
        console.log("Error: ", error)
        return Promise.reject(error);
    }

}

const update_helper = async (channelid, sender_public_key, amount, receiver_public_key) => {
    try {

        const action = 3; // off-chain tx
        const sender = sender_public_key.toString();
        const receiver = receiver_public_key.toString();

        const last_off_chain_state = await state_helper.get_last_channel_state(channelid);
        const num_of_stakeholders = last_off_chain_state.length;

        // calculate new balances
        // determine if both of stakeholders are part of channel (off-chain and on-chain)
        if (!last_off_chain_state.find((item) => item.address === sender)) {
            console.log('sender: ', sender);
            console.log('last_off_chain_state: ', last_off_chain_state);
            console.log('Sender not part of channel (off-chain)!')
            return Promise.reject('Sender not part of channel!');
        }

        if (!last_off_chain_state.find((item) => item.address === receiver)) {
            console.log('Receiver not part of channel (off-chain)!')
            return Promise.reject('Receiver not part of channel!');
        }

        const sender_balance = last_off_chain_state.find((item) => item.address === sender).balance;
        // console.log('Sender balance:', sender_balance);
        const receiver_balance = last_off_chain_state.find((item) => item.address === receiver).balance;
        // console.log('Receiver balance:', receiver_balance);

        if (sender_balance < amount) {
            console.log('Sender does not have enough balance!')
            return Promise.reject('Sender does not have enough balance!');
        }

        const sender_balance_new = sender_balance - amount;
        const receiver_balance_new = receiver_balance + amount;

        const sender_index = last_off_chain_state.findIndex((item) => item.address === sender);
        const receiver_index = last_off_chain_state.findIndex((item) => item.address === receiver);

        last_off_chain_state[sender_index].balance = sender_balance_new;
        last_off_chain_state[receiver_index].balance = receiver_balance_new;

        // Generate schema
        const fields = [
            ['action', 'u8'],
            ['channelid', 'string']
        ];
        for (let i = 1; i <= num_of_stakeholders; i++) {
            fields.push([`address${i}`, [32]]);
            fields.push([`balance${i}`, 'u64']);
        }
        fields.push(['sender', [32]]);
        fields.push(['num_of_stakeholders', 'u8']);

        const off_chain_token_data_schema = new Map([[Data, {
            kind: 'struct',
            fields
        }]]);


        // Generate off-chain tx data
        let pre_off_chain_tx_data = new Data({
            action: action,
            channelid: channelid,
        });
        last_off_chain_state.forEach((item, index) => {
            pre_off_chain_tx_data["address" + (index + 1)] = new Web3.PublicKey(item.address).toBytes();
            pre_off_chain_tx_data["balance" + (index + 1)] = item.balance;
        });
        pre_off_chain_tx_data.sender = sender_public_key.toBytes();
        pre_off_chain_tx_data.num_of_stakeholders = num_of_stakeholders;

        const pre_off_chain_tx_oracle_encoded = borsh.serialize(off_chain_token_data_schema, pre_off_chain_tx_data);

        return Promise.resolve(pre_off_chain_tx_oracle_encoded);

    } catch (error) {
        console.log(error);
        return Promise.reject(error);
    }
}

module.exports = {
    main,
    update_helper
}
