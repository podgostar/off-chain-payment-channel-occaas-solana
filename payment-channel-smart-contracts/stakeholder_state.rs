use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::pubkey::Pubkey;

// stakeholder_pda = (channelid+publickey)
#[derive(BorshSerialize, BorshDeserialize)]
pub struct StakeholderState {
    pub stakeholder_address: Pubkey, // address
    pub balance: u64,                // balance
    pub status: u8,                  //  status codes: 0 = UNDEFINED; 1 = INVITED; 2 = ACTIVE;
}
