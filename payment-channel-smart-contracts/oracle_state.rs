use borsh::{BorshDeserialize, BorshSerialize};
use solana_program::pubkey::Pubkey;

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct OracleState {
    pub oracle_address: Pubkey,
    pub oracle_status: bool,
}
