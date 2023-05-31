const web3 = require('@solana/web3.js');
const borsh = require("borsh");

const configuration = require("./configuration.js");

const connection = configuration.connection;

const program_id = configuration.program_id;
const logsFilter = new web3.PublicKey(program_id);

const ipfs_helper = require('./utils/ipfs-helper-oracle.js');

class Assignable {
    constructor(properties) {
        Object.keys(properties).map((key) => {
            this[key] = properties[key];
        });
    }
}

class Data extends Assignable {
}

const logsSubcribe = async () => {

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

    try {

        const subcriptionId = connection.onLogs(logsFilter, (logs, context) => {
            logs.logs.forEach(async log => {
                if (log.includes('JoinEvent')) {
                    console.log(log)
                    const parts = log.split('JoinEvent: ');
                    const data = parts[1];
                    console.log(data);
                    const array = JSON.parse(data)

                    const join_token_decoded = borsh.deserialize(join_token_schema, Data, Buffer.from(Uint8Array.from(array)));

                    const join_token_core_data_decoded = borsh.deserialize(join_token_core_data_schema_oracle, Data, Buffer.from(join_token_decoded.encoded_data));

                    const prev_state_cid = await ipfs_helper.resolve_cid_ipns(join_token_core_data_decoded.channelid);

                    let join_token_data = new Data(
                        {
                            encoded_data: join_token_decoded.encoded_data,
                            prev_state: prev_state_cid,
                            sig_oracle: join_token_decoded.sig_oracle
                        }
                    );

                    const join_token_encoded = borsh.serialize(join_token_schema, join_token_data);

                    // IPFS + IPNS stuff
                    const cid = await ipfs_helper.store_data_ipfs(join_token_encoded);
                    await ipfs_helper.publish_ipns(join_token_core_data_decoded.channelid, cid);

                }
            })
        }, 'confirmed')
    } catch (error) {
        console.log(error);
    }
}

async function main() {
    await logsSubcribe();
}

main();




