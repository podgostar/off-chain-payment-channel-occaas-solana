// IPFS connection parameters
const configuration = require("../configuration.js");

const host = configuration.host;
const port = configuration.port;
const protocol = configuration.protocol;

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

async function create_ipns_key(channelid) {
    try {
        const ipfs = await create_ipfs_client();
        const generated = await ipfs.key.gen(channelid, { type: 'rsa', size: 2048 });
        return Promise.resolve(generated);
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

async function publish_ipns(channelid, cid) {
    try {
        const ipfs = await create_ipfs_client();
        const res = await ipfs.name.publish(cid, { key: channelid });
        return Promise.resolve(res);
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
    publish_ipns,
    check_ipns_key_existence,
    create_ipns_key,
    resolve_cid_ipns,
    check_ipns_key_existence
}
