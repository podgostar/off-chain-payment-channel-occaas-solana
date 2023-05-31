const borsh = require("borsh");
const Base58 = require("base-58");

const Web3 = require("@solana/web3.js");

const configuration = require("../configuration.js");

const connection = configuration.connection;

// PROGRAM DATA
const program_address = configuration.program_id;
const program_pubkey = new Web3.PublicKey(program_address);

const ipfs_helper = require("./ipfs-helper-client.js");

class Assignable {
    constructor(properties) {
        Object.keys(properties).map((key) => {
            this[key] = properties[key];
        });
    }
}

class Data extends Assignable {
}

class StakeholderState extends Assignable {
}

async function decode_channel_state(encodedData) { // this is relevant only for actions: 1 - open; join (i.e., where only one state (= tuple address, balance) is present)

    const action_schema = new Map([
        [Data, { kind: 'struct', fields: [['action', 'u8']] }]
    ]);

    const decoded_schema = new Map([[Data, {
        kind: 'struct',
        fields: [
            ['encoded_data', ["u8"]],
            ['prev_state', 'string'],
            ['sig_oracle', [64]]
        ]
    }]]);

    const decoded = borsh.deserialize(decoded_schema, Data, Buffer.from(encodedData, 'hex'));

    const action_data = borsh.deserialize(action_schema, Data, Buffer.from(decoded.encoded_data, 'hex').slice(0, 1));

    if (action_data.action == 1 || action_data.action == 2 || action_data.action == 4) { // open or join

        const data_decoded_schema = new Map([[Data, {
            kind: 'struct',
            fields: [
                ['action', 'u8'],
                ['channelid', 'string'],
                ['address', [32]], // !
                ['balance', 'u64'], // !
                ['sender', [32]],
                ['sig_sender', [64]],
            ]
        }]]);

        const data_decoded = borsh.deserialize(data_decoded_schema, Data, Buffer.from(decoded.encoded_data, 'hex'));
        const addressRegex = /^address(\d*)$/;
        const balanceRegex = /^balance(\d*)$/;
        const state = [];

        // Loop over the object keys
        for (const key in data_decoded) {
            // Check if the key matches the address or balance pattern
            const addressMatch = key.match(addressRegex);
            const balanceMatch = key.match(balanceRegex);
            if (addressMatch) {
                const addressIndex = parseInt(addressMatch[1] || "0", 10);
                if (!state[addressIndex]) { // if state[addressIndex] is undefined, then create new object
                    state[addressIndex] = {};
                }
                state[addressIndex].address = Base58.encode(data_decoded[key]);
            } else if (balanceMatch) {
                const balanceIndex = parseInt(balanceMatch[1] || "0", 10);
                if (!state[balanceIndex]) {
                    state[balanceIndex] = {};
                }
                state[balanceIndex].balance = parseInt(data_decoded[key]);
            }
        }

        return Promise.resolve({
            action: data_decoded.action,
            channel_id: data_decoded.channelid,
            state: state,
            sender: Base58.encode(data_decoded.sender),
            state_prev: decoded.prev_state,
            sender_sig: data_decoded.sig_sender,
            oracle_sig: decoded.sig_oracle
        });

    } else if (action_data.action == 3) { // if off-chain tx, then we have different schema, and based on encoded_data (last 1 byte we get num of participants)
        // generate schema
        const num_of_participants_schema = new Map([
            [Data, { kind: 'struct', fields: [['num_of_stakeholders', 'u8']] }]
        ]);

        const buffer_slice_num_of_participants = Buffer.from(decoded.encoded_data, 'hex').slice(Buffer.from(decoded.encoded_data, 'hex').length - 65, Buffer.from(decoded.encoded_data, 'hex').length - 64);
        const data = borsh.deserialize(num_of_participants_schema, Data, buffer_slice_num_of_participants);

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
        fields.push(['sig_sender', [64]]);

        const token_schema = new Map([[Data, {
            kind: 'struct',
            fields
        }]]);

        const data_decoded = borsh.deserialize(token_schema, Data, Buffer.from(decoded.encoded_data, 'hex'));
        const addressRegex = /^address(\d*)$/;
        const balanceRegex = /^balance(\d*)$/;
        const state = [];

        // Loop over the object keys
        for (const key in data_decoded) {
            // Check if the key matches the address or balance pattern
            const addressMatch = key.match(addressRegex);
            const balanceMatch = key.match(balanceRegex);
            if (addressMatch) {
                const addressIndex = parseInt(addressMatch[1] || "0", 10);
                if (!state[addressIndex]) {
                    state[addressIndex] = {};
                }
                state[addressIndex].address = Base58.encode(data_decoded[key]);
            } else if (balanceMatch) {
                const balanceIndex = parseInt(balanceMatch[1] || "0", 10);
                if (!state[balanceIndex]) {
                    state[balanceIndex] = {};
                }
                state[balanceIndex].balance = parseInt(data_decoded[key]);
            }
        }

        state.shift();

        return Promise.resolve({
            action: data_decoded.action,
            channel_id: data_decoded.channelid,
            state: state,
            sender: Base58.encode(data_decoded.sender),
            state_prev: decoded.prev_state,
            sender_sig: data_decoded.sig_sender,
            oracle_sig: decoded.sig_oracle
        });

    }
}

async function get_relevant_states(ipfs_cid, states = []) {
    const ipfs_state_encoded = await ipfs_helper.get_data_ipfs(ipfs_cid); // get hex

    const state = await decode_channel_state(ipfs_state_encoded);

    if (state.action === 1) {
        const open_status = await check_stakeholder_open_status(state.channel_id, state.sender);
        if (open_status === true) {
            return [{ action: state.action, state: state.state }, ...states];
        } else {
            return Promise.reject('No stakeholders joined/opened channel');
        }
    } else if (state.action === 3) {
        return [{ action: state.action, state: state.state }, ...states];
    } else {
        return await get_relevant_states(state.state_prev, [{ action: state.action, state: state.state }, ...states]);
    }
}

async function check_stakeholder_open_status(channelid, stakeholder) {

    const stakeholder_public_key = new Web3.PublicKey(stakeholder);

    const pda_stakeholder = Web3.PublicKey.findProgramAddressSync([Buffer.from(channelid), stakeholder_public_key.toBuffer()], program_pubkey);
    const pda_stakeholder_info = await connection.getAccountInfo(pda_stakeholder[0]);

    if (pda_stakeholder_info == null) {
        console.log('Stakeholder does not exist');
        return Promise.resolve(false);
    }

    return Promise.resolve(true);

}

async function get_last_channel_state(channelid) {

    let state_data = {};

    try {
        const ipfs_cid = await ipfs_helper.resolve_cid_ipns(channelid);
        const all_relevant_states = await get_relevant_states(ipfs_cid);

        all_relevant_states.forEach((curr) => {
            if (curr.action === 1) { 
                state_data[curr.state[0].address] = curr.state[0].balance;
            } else if (curr.action === 3) {
                curr.state.forEach((state) => {
                    state_data[state.address] = state.balance;
                });
            } else if (curr.action === 4) {
                const address = curr.state[0].address;
                if (state_data.hasOwnProperty(address)) {
                    delete state_data[address];
                }
            } else if (curr.action === 2) { 
                const address = curr.state[0].address;
                if (state_data.hasOwnProperty(address)) {
                    state_data[address] += curr.state[0].balance;
                } else {
                    state_data[address] = curr.state[0].balance;
                }
            }
        });

        state_data = Object.entries(state_data).map(([address, balance]) => ({ address, balance }));
    } catch (error) {
        console.log(error);
    }

    return state_data;
}

async function generate_off_chain_tx_schema(num_of_stakeholders) {

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

    return off_chain_token_data_schema;

}

async function get_state_channel_history(channel_id, cid) {

    let ipfs_state_encoded;

    try {
        if (channel_id != null) {
            const ipfs_cid = await ipfs_helper.resolve_cid_ipns(channel_id);
            ipfs_state_encoded = await ipfs_helper.get_data_ipfs(ipfs_cid); // get hex
        } else {
            ipfs_state_encoded = await ipfs_helper.get_data_ipfs(cid); // get hex
        }

        const state = await decode_channel_state(ipfs_state_encoded);
        console.log(JSON.stringify(state));

        if (state.state_prev != "0") {
            return [state, ...await get_all_channel_history(null, state.state_prev)];
        } else {
            return [state];
        }

    } catch (error) {
        console.log(error);
    }

}

module.exports = {
    decode_channel_state,
    get_relevant_states,
    get_last_channel_state,
    generate_off_chain_tx_schema,
    get_state_channel_history
}
