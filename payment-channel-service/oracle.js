const Web3 = require("@solana/web3.js");
const Base58 = require("base-58");
const Nacl = require("tweetnacl");
const borsh = require("borsh");

const configuration = require("./configuration.js");

const connection = configuration.connection;

const ipfs_helper = require('./utils/ipfs-helper-oracle.js');
const state_helper = require('./utils/state-helper-oracle.js');

// PROGRAM DATA
const program_address = configuration.program_id;

const program_pubkey = new Web3.PublicKey(program_address);
const oracle_keypair = Web3.Keypair.fromSecretKey(Uint8Array.from(configuration.oracle_private_key));

class Assignable {
    constructor(properties) {
        Object.keys(properties).map((key) => {
            this[key] = properties[key];
        });
    }
}

class Data extends Assignable {
}

class ChannelState extends Assignable {
}

// To get info from blockchain
const channel_state_schema = new Map([[ChannelState, {
    kind: 'struct',
    fields: [
        ['channel_id', 'string'],
        ['oracle_address', [32]],
        ['current_status', 'u8'],
        ['num_of_stakeholders', 'u8'],
    ]
}]]);

const open = async (pre_open_token_data_sig_sender) => {

    try {

        const pre_open_token_core_data_schema_sender = new Map([[Data, {
            kind: 'struct',
            fields: [
                ['action', 'u8'],
                ['channelid', 'string'],
                ['address', [32]],
                ['balance', 'u64'],
                ['sender', [32]],
            ]
        }]]);

        const pre_open_token_schema_sig_sender = new Map([[Data, {
            kind: 'struct',
            fields: [
                // ['encoded_data', 'string'],// !
                ['encoded_data', ["u8"]],
                ['prev_state', 'string'],
                ['sig_sender', [64]],
            ]
        }]]);

        const open_token_core_data_schema_oracle = new Map([[Data, {
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

        const open_token_schema = new Map([[Data, {
            kind: 'struct',
            fields: [
                ['encoded_data', ["u8"]],
                ['prev_state', 'string'],
                ['sig_oracle', [64]]
            ]
        }]]);

        const pre_open_token_decoded_sender = borsh.deserialize(pre_open_token_schema_sig_sender, Data, pre_open_token_data_sig_sender);
        const open_token_core_data_decoded = borsh.deserialize(pre_open_token_core_data_schema_sender, Data, Buffer.from(pre_open_token_decoded_sender.encoded_data));

        // check that channel id (ipns id) does not exists (on IPFS) (it should not exist)
        const ipns_existence = await ipfs_helper.check_ipns_key_existence(open_token_core_data_decoded.channelid);

        if (ipns_existence) {
            return Promise.reject(Error("Channel ID already exists (IPNS)"));
        }

        const pda_channel = Web3.PublicKey.findProgramAddressSync([Buffer.from(open_token_core_data_decoded.channelid)], program_pubkey);
        const pda_channel_info = await connection.getAccountInfo(pda_channel[0]);

        if (!pda_channel_info === null) {
            return Promise.reject(Error("Channel ID already exists (blockchain)"));
        }

        // Check if prev_state is 0
        if (pre_open_token_decoded_sender.prev_state != '0') {
            console.log("Defined prev_state within token is not 0");
            console.log(pre_open_token_decoded_sender.prev_state);
            return Promise.reject(Error("Defined prev_state within token is not 0"));
        }

        const senderMatch = Buffer.compare(open_token_core_data_decoded.sender, open_token_core_data_decoded.address); // open_token_core_data_decoded.sender == open_token_core_data_decoded.address;
        const balanceValid = parseInt(open_token_core_data_decoded.balance) > 0;

        if (senderMatch != 0) {
            console.log('Sender: ', open_token_core_data_decoded.sender)
            console.log('Address: ', open_token_core_data_decoded.address)
            return Promise.reject(Error("Sender and address defined within token are not the same"));
        }

        // Check state defined within token
        if (!balanceValid) {
            console.log('Balance: ', parseInt(open_token_core_data_decoded.balance))
            return Promise.reject(Error("Balance defined within token is not valid"));
        }

        const verify_sender_sig = Nacl.sign.detached.verify(
            Buffer.from(pre_open_token_decoded_sender.encoded_data),
            pre_open_token_decoded_sender.sig_sender,
            open_token_core_data_decoded.sender
        );

        if (!verify_sender_sig) {
            throw new Error('Signature verification failed');
        }

        let open_token_core_data_oracle = new Data(
            {
                action: open_token_core_data_decoded.action,
                channelid: open_token_core_data_decoded.channelid,
                address: open_token_core_data_decoded.address,
                balance: open_token_core_data_decoded.balance,
                sender: open_token_core_data_decoded.sender,
                sig_sender: pre_open_token_decoded_sender.sig_sender
            }
        );

        const open_token_core_data_encoded_oracle = borsh.serialize(open_token_core_data_schema_oracle, open_token_core_data_oracle);

        // return signed open_token
        const sig_oracle_open = Nacl.sign.detached(Uint8Array.from(open_token_core_data_encoded_oracle), oracle_keypair.secretKey);

        let open_token_data = new Data(
            {
                encoded_data: open_token_core_data_encoded_oracle,
                prev_state: pre_open_token_decoded_sender.prev_state,
                sig_oracle: sig_oracle_open
            }
        );

        let open_token_encoded = borsh.serialize(open_token_schema, open_token_data);

        // IPFS + IPNS stuff
        const ipns_key = await ipfs_helper.create_ipns_key(open_token_core_data_decoded.channelid);
        // console.log('ipns_key: ', ipns_key);
        const cid = await ipfs_helper.store_data_ipfs(open_token_encoded);
        await ipfs_helper.publish_ipns(open_token_core_data_decoded.channelid, cid);

        return Promise.resolve(open_token_encoded);

    } catch (error) {
        console.log(error);
        return Promise.reject(error);
    }

}

const join = async (pre_open_token_data_sig_sender) => {

    const join_token_core_data_schema_oracle = new Map([[Data, {
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

    const join_token_schema = new Map([[Data, {
        kind: 'struct',
        fields: [
            ['encoded_data', ["u8"]],
            ['prev_state', 'string'],
            ['sig_oracle', [64]]
        ]
    }]]);

    const join_token_core_data_schema_sender = new Map([[Data, {
        kind: 'struct',
        fields: [
            ['action', 'u8'],
            ['channelid', 'string'],
            ['address', [32]],
            ['balance', 'u64'],
            ['sender', [32]],
        ]
    }]]);

    const pre_join_token_schema_sig_sender = new Map([[Data, {
        kind: 'struct',
        fields: [
            ['encoded_data', ["u8"]],
            ['prev_state', 'string'],
            ['sig_sender', [64]],
        ]
    }]]);

    try {

        const pre_join_token_decoded_sender = borsh.deserialize(pre_join_token_schema_sig_sender, Data, pre_open_token_data_sig_sender);

        const join_token_core_data_decoded = borsh.deserialize(join_token_core_data_schema_sender, Data, Buffer.from(pre_join_token_decoded_sender.encoded_data));

        // check that channel id (ipns id) exists (on IPFS) (it should exist)
        const ipns_existence = await ipfs_helper.check_ipns_key_existence(join_token_core_data_decoded.channelid);

        if (!ipns_existence) {
            return Promise.reject(Error("Channel ID does not exist (IPNS)"));
        }

        const verify_sender_sig = Nacl.sign.detached.verify(
            Buffer.from(pre_join_token_decoded_sender.encoded_data),
            pre_join_token_decoded_sender.sig_sender,
            join_token_core_data_decoded.sender
        );

        if (!verify_sender_sig) {
            throw new Error('Signature verification failed');
        }

        const pda_channel = Web3.PublicKey.findProgramAddressSync([Buffer.from(join_token_core_data_decoded.channelid)], program_pubkey);
        const pda_channel_info = await connection.getAccountInfo(pda_channel[0]);
        const channel_info_decoded = borsh.deserialize(channel_state_schema, ChannelState, pda_channel_info.data);

        if (pda_channel_info === null) {
            console.log('Channel not found')
            return Promise.reject(Error("Channel ID does not exist (blockchain)"));
        }

        if (channel_info_decoded.current_status != 1) {
            console.log('Channel not in open state')
            console.log('Current status: ', channel_info_decoded.current_status);
            return Promise.reject(Error("Channel not in open state"));
        }

        // Check if prev_state is 0
        if (pre_join_token_decoded_sender.prev_state != '0') {
            console.log("Defined prev_state within token is not 0");
            console.log(pre_open_token_decoded_sender.prev_state);
            return Promise.reject(Error("Defined prev_state within token is not 0"));
        }

        const senderMatch = Buffer.compare(join_token_core_data_decoded.sender, join_token_core_data_decoded.address); // open_token_core_data_decoded.sender == open_token_core_data_decoded.address;
        const balanceValid = parseInt(join_token_core_data_decoded.balance) > 0;

        if (senderMatch != 0) {
            console.log('Sender: ', join_token_core_data_decoded.sender)
            console.log('Address: ', join_token_core_data_decoded.address)
            return Promise.reject(Error("Sender and address defined within token are not the same"));
        }

        // Check state defined within token
        if (!balanceValid) {
            console.log('Balance: ', parseInt(join_token_core_data_decoded.balance))
            return Promise.reject(Error("Balance defined within token is not valid"));
        }

        let join_token_core_data_oracle = new Data(
            {
                action: join_token_core_data_decoded.action,
                channelid: join_token_core_data_decoded.channelid,
                address: join_token_core_data_decoded.address,
                balance: join_token_core_data_decoded.balance,
                sender: join_token_core_data_decoded.sender,
                sig_sender: pre_join_token_decoded_sender.sig_sender
            }
        );

        const join_token_core_data_encoded_oracle = borsh.serialize(join_token_core_data_schema_oracle, join_token_core_data_oracle);

        // return signed join_token
        const sig_oracle_join = Nacl.sign.detached(Uint8Array.from(join_token_core_data_encoded_oracle), oracle_keypair.secretKey);

        let join_token_data = new Data(
            {
                encoded_data: join_token_core_data_encoded_oracle,
                prev_state: pre_join_token_decoded_sender.prev_state,
                sig_oracle: sig_oracle_join
            }
        );

        let join_token_encoded = borsh.serialize(join_token_schema, join_token_data);
        // console.log('join_token_encoded hex: ', join_token_encoded.toString('hex'));

        return Promise.resolve(join_token_encoded);


    } catch (error) {
        console.log(error);
        return Promise.reject(error);
    }



}

const update = async (tx_token_sender_signed, sender_public_key, amount, receiver_public_key) => {
    try {

        const action = 3; // off-chain tx
        const sender = sender_public_key.toString();
        const receiver = receiver_public_key.toString();

        const pre_tx_token_schema_sig_sender = new Map([[Data, {
            kind: 'struct',
            fields: [
                ['encoded_data', ["u8"]],
                ['prev_state', 'string'],
                ['sig_sender', [64]],
            ]
        }]]);

        const pre_tx_token_decoded = borsh.deserialize(pre_tx_token_schema_sig_sender, Data, tx_token_sender_signed);

        const num_of_participants_schema = new Map([
            [Data, { kind: 'struct', fields: [['num_of_stakeholders', 'u8']] }]
        ]);

        const data = borsh.deserialize(num_of_participants_schema, Data, Buffer.from(pre_tx_token_decoded.encoded_data, 'hex').slice(Buffer.from(pre_tx_token_decoded.encoded_data, 'hex').length - 1));

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

        const off_chain_token_data_schema_sender = new Map([[Data, {
            kind: 'struct',
            fields
        }]]);

        const off_chain_token_data_decoded = borsh.deserialize(off_chain_token_data_schema_sender, Data, Buffer.from(pre_tx_token_decoded.encoded_data, 'hex'));

        const addressRegex = /^address(\d*)$/;
        const balanceRegex = /^balance(\d*)$/;
        const calculated_state = [];

        // Loop over the object keys
        for (const key in off_chain_token_data_decoded) {
            // Check if the key matches the address or balance pattern
            const addressMatch = key.match(addressRegex);
            const balanceMatch = key.match(balanceRegex);
            if (addressMatch) {
                const addressIndex = parseInt(addressMatch[1] || "0", 10);
                if (!calculated_state[addressIndex]) {
                    calculated_state[addressIndex] = {};
                }
                calculated_state[addressIndex].address = Base58.encode(off_chain_token_data_decoded[key]);
            } else if (balanceMatch) {
                const balanceIndex = parseInt(balanceMatch[1] || "0", 10);
                if (!calculated_state[balanceIndex]) {
                    calculated_state[balanceIndex] = {};
                }
                calculated_state[balanceIndex].balance = parseInt(off_chain_token_data_decoded[key]);
            }
        }

        // since in this case address and balance start from 1, we need to remove first element
        calculated_state.shift();

        const last_off_chain_state = await state_helper.get_last_channel_state(off_chain_token_data_decoded.channelid);

        // calculate new balances
        // determine if both of stakeholders are part of channel (off-chain and on-chain)
        if (!last_off_chain_state.find((item) => item.address === sender)) {
            console.log('sender: ', sender);
            console.log('last_off_chain_state: ', item);
            console.log('Sender not part of channel (off-chain)!')
            return Promise.reject('Sender not part of channel!');
        }

        if (!last_off_chain_state.find((item) => item.address === receiver)) {
            console.log('Receiver not part of channel (off-chain)!')
            return Promise.reject('Receiver not part of channel!');
        }

        const sender_balance = last_off_chain_state.find((item) => item.address === sender).balance;
        const receiver_balance = last_off_chain_state.find((item) => item.address === receiver).balance;

        if (sender_balance < amount) {
            console.log('Sender does not have enough balance!')
            return Promise.reject('Sender does not have enough balance!');
        }

        // check if sender signature is valid
        const verify_sender_sig = Nacl.sign.detached.verify(
            Buffer.from(pre_tx_token_decoded.encoded_data),
            pre_tx_token_decoded.sig_sender,
            off_chain_token_data_decoded.sender
        );

        if (!verify_sender_sig) {
            throw new Error('Signature verification failed');
        }

        // check if action is valid
        if (off_chain_token_data_decoded.action !== action) {
            console.log('Action is not valid!')
            return Promise.reject('Action is not valid!');
        }

        const sender_balance_new = sender_balance - amount;
        const receiver_balance_new = receiver_balance + amount;

        const sender_index = last_off_chain_state.findIndex((item) => item.address === sender);
        const receiver_index = last_off_chain_state.findIndex((item) => item.address === receiver);

        last_off_chain_state[sender_index].balance = sender_balance_new;
        last_off_chain_state[receiver_index].balance = receiver_balance_new;

        if (!JSON.stringify(calculated_state.state) === JSON.stringify(last_off_chain_state)) {
            console.log('State is different!');
            return Promise.reject('State is different!');
        }

        fields.push(['sig_sender', [64]],);

        const off_chain_token_data_schema = new Map([[Data, {
            kind: 'struct',
            fields
        }]]);

        const off_chain_tx_schema = new Map([[Data, {
            kind: 'struct',
            fields: [
                ['encoded_data', ["u8"]],
                ['prev_state', 'string'],
                ['sig_oracle', [64]]
            ]
        }]]);

        // Generate off-chain tx data
        let off_chain_tx_data = new Data({
            action: off_chain_token_data_decoded.action,
            channelid: off_chain_token_data_decoded.channelid,
        });
        calculated_state.forEach((item, index) => {
            off_chain_tx_data["address" + (index + 1)] = new Web3.PublicKey(item.address).toBytes();
            off_chain_tx_data["balance" + (index + 1)] = item.balance;
        });
        off_chain_tx_data.sender = off_chain_token_data_decoded.sender;
        off_chain_tx_data.num_of_stakeholders = off_chain_token_data_decoded.num_of_stakeholders;
        off_chain_tx_data.sig_sender = pre_tx_token_decoded.sig_sender;
        // serialize off_chain_tx_data
        const off_chain_tx_data_encoded = borsh.serialize(off_chain_token_data_schema, off_chain_tx_data);

        // sign off_chain_tx_data
        const off_chain_tx_data_encoded_sig_oracle = Nacl.sign.detached(Buffer.from(off_chain_tx_data_encoded), oracle_keypair.secretKey);

        const prev_state_cid = await ipfs_helper.resolve_cid_ipns(off_chain_token_data_decoded.channelid);

        // serialize off_chain_tx
        const off_chain_tx = new Data({
            encoded_data: off_chain_tx_data_encoded,
            prev_state: prev_state_cid, // get from IPFS
            sig_oracle: off_chain_tx_data_encoded_sig_oracle
        });

        const off_chain_tx_encoded = borsh.serialize(off_chain_tx_schema, off_chain_tx);

        // IPFS + IPNS stuff
        const res_store = await ipfs_helper.store_data_ipfs(off_chain_tx_encoded);
        await ipfs_helper.publish_ipns(off_chain_token_data_decoded.channelid, res_store);
        return Promise.resolve("OK");


    } catch (error) {
        console.log(error);
        return Promise.reject(error);
    }
}

const leave = async (leave_data_signed_encoded_sender) => {

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

        const leave_token_core_data_decoded = borsh.deserialize(leave_token_core_data_schema, Data, leave_data_signed_encoded_sender);

        const last_off_chain_state = await state_helper.get_last_channel_state(leave_token_core_data_decoded.channelid);

        if (!last_off_chain_state.find((item) => item.address === Base58.encode(leave_token_core_data_decoded.sender))) {
            console.log('Sender not part of channel (off-chain)!')
            return Promise.reject('Sender not part of channel!');
        }

        const sender_balance = last_off_chain_state.find((item) => item.address === Base58.encode(leave_token_core_data_decoded.sender)).balance;
        console.log('Sender balance:', sender_balance);

        if (sender_balance !== parseInt(leave_token_core_data_decoded.balance)) {
            console.log('Wrong balance defined!')
            console.log('sender_balance:', sender_balance);
            console.log('leave_token_core_data_decoded.balance:', parseInt(leave_token_core_data_decoded.balance));
            return Promise.reject('Wrong balance defined!');
        }

        let data_for_sig_verification = new Data({
            action: leave_token_core_data_decoded.action,
            channelid: leave_token_core_data_decoded.channelid,
            address: leave_token_core_data_decoded.address,
            balance: leave_token_core_data_decoded.balance,
            sender: leave_token_core_data_decoded.sender,
        });

        const data_for_sig_verification_encoded = borsh.serialize(pre_leave_token_core_data_schema, data_for_sig_verification);

        // check signature
        const is_valid = Nacl.sign.detached.verify(Buffer.from(data_for_sig_verification_encoded), leave_token_core_data_decoded.sig_sender, leave_token_core_data_decoded.sender);
        if (!is_valid) {
            console.log('Invalid signature!')
            return Promise.reject('Invalid signature!');
        }

        // sign data oracle (off-chain)
        const leave_token_signed_oracle = Nacl.sign.detached(Buffer.from(leave_data_signed_encoded_sender), oracle_keypair.secretKey);

        // get prev state cid
        const prev_state_cid = await ipfs_helper.resolve_cid_ipns(leave_token_core_data_decoded.channelid);

        // create off-chain tx
        let leave_token = new Data({
            encoded_data: leave_data_signed_encoded_sender,
            prev_state: prev_state_cid,
            sig_oracle: leave_token_signed_oracle,
        });

        const leave_token_encoded = borsh.serialize(leave_token_schema, leave_token);

        // ipns+ipfs
        const res_store = await ipfs_helper.store_data_ipfs(leave_token_encoded);
        await ipfs_helper.publish_ipns(leave_token_core_data_decoded.channelid, res_store);

        return Promise.resolve(leave_token_encoded);

    } catch (error) {
        console.log(error);
        return Promise.reject(error);
    }

}

module.exports = {
    open,
    join,
    update,
    leave
}
