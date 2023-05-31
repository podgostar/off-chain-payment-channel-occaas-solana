use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::pubkey::Pubkey;

#[derive(BorshSerialize, BorshDeserialize)]
pub struct ChannelState {
    pub channel_id: String,             // channelid
    pub oracle_address: Pubkey,         // address of oracle
    pub current_status: u8,             // 1 = opened, 2 = closed
    pub num_of_active_stakeholders: u8, // number of stakeholders
}
