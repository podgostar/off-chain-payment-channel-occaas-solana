const helper = require("./utils/experiment-state-helper.js");
const ipfs_helper = require("./utils/experiment-ipfs-helper.js");

const configuration = require("./configuration.js");

const get_last_channel_state = async (channel_id) => {

    const last_state = await helper.get_last_channel_state(channel_id);
    console.log("Last off-chain state: ", last_state);
}

const get_all_channel_states = async (channel_id) => {

    await helper.get_state_channel_history(channel_id, null);
}

module.exports = {
    get_last_channel_state,
    get_all_channel_states
}

// get_all_channel_states(configuration.channel_id);
get_last_channel_state(configuration.channel_id);
