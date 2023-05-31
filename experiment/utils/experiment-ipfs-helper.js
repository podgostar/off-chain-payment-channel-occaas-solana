// IPFS connection parameters
const configuration = require("../configuration.js");

const host = configuration.ipfs_config.host;
const port = configuration.ipfs_config.port;
const protocol = configuration.ipfs_config.protocol;

let ipfsClient;

async function create_ipfs_client() {
    if (!ipfsClient) {
        try {
            const { create } = await import('ipfs-http-client');
            ipfsClient = create({ host, port, protocol });
        } catch (error) {
            console.log(error);
            return Promise.reject(error);
        }
    }

    return ipfsClient;
}

async function store_data_ipfs(data) {
    try {
        const ipfs = await create_ipfs_client();
        const cid = await ipfs.add(data.toString('hex')); // transform to hex
        return Promise.resolve(cid.path);
    } catch (error) {
        return Promise.reject(error);
    }
}

async function get_data_ipfs(cid) {
    try {
        let ipfs = await create_ipfs_client();
        let asyncitr = ipfs.cat(cid);
        for await (const itr of asyncitr) {
            let data = Buffer.from(itr).toString();
            return Promise.resolve(data); // return hex
        }
        return Promise.reject(Error("No data found"));
    } catch (error) {
        return Promise.reject(error);
    }
}

async function check_ipns_key_existence(channelid) {
    try {
        const ipfs = await create_ipfs_client();
        const res = await ipfs.key.list();
        const key = res.find((key) => key.name === channelid);
        if (key) {
            return Promise.resolve(true);
        } else {
            return Promise.resolve(false);
        }
    } catch (error) {
        return Promise.reject(error);
    }
}

async function resolve_cid_ipns(channelid) {
    try {
        const ipfs = await create_ipfs_client();
        const res = await ipfs.key.list();
        const key_result = await res.find((key) => key.name == channelid);

        if (key_result) { // res.result == tru
            let name_res;
            for await (const name of ipfs.name.resolve(key_result.id)) {
                name_res = name;
                break;
            }
            return Promise.resolve(name_res);
        }
        return Promise.reject(Error("No ipns key found"));
    } catch (error) {
        return Promise.reject(error);
    }
}

module.exports = {
    create_ipfs_client,
    store_data_ipfs,
    get_data_ipfs,
    check_ipns_key_existence,
    resolve_cid_ipns,
    check_ipns_key_existence
}
