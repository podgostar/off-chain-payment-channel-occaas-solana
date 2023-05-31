use borsh::BorshSerialize;
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    borsh::try_from_slice_unchecked,
    entrypoint::ProgramResult,
    msg,
    program::invoke_signed,
    program_error::ProgramError,
    pubkey::Pubkey,
    system_instruction,
    sysvar::{rent::Rent, Sysvar},
};
use std::str::FromStr;

use crate::oracle_state::OracleState;

pub fn modify_oracle(
    program_id: &Pubkey,
    accounts: &[AccountInfo], // TO PRIDE NOTRI KO KLIČEMO?!!?!??
    oracle_address: Pubkey,
) -> ProgramResult {
    msg!("Entering modify oracle function");

    let account_info_iter = &mut accounts.iter();

    // Get accounts
    let initializer = next_account_info(account_info_iter)?; // msg.sender :)
    let oracle_state_account = next_account_info(account_info_iter)?; // get - we will have only one oracle for PoC purposes
    let system_program = next_account_info(account_info_iter)?;

    // Hardcoded "owner" public key
    let initial_owner_string =
        Pubkey::from_str("FXCB4QMbUFC4B8zpo7Hx4ihm3RL5mt7LQoVJbrdRiHhJ").unwrap();

    // check that tx sender is owner of system program // ni tako trivialno!
    msg!("Initializer KEY {}", initializer.key);
    msg!("initial owner KEY {} ", initial_owner_string);
    if initializer.key != &initial_owner_string {
        return Err(ProgramError::IllegalOwner);
    }

    // if no data - ORACLE account data does not exist
    if AccountInfo::data_is_empty(oracle_state_account) == false {
        // check owner also here
        msg!("ORACLE account DATA already exist");
        msg!("Unpacking ORACLE account data");
        let mut oracle_account_data =
            try_from_slice_unchecked::<OracleState>(&oracle_state_account.data.borrow()).unwrap();
        msg!("Borrowed ORACLE Account data");

        msg!(
            "Current ORACLE status is: {}",
            oracle_account_data.oracle_status
        );

        if oracle_account_data.oracle_status == true {
            let new_status = false;
            msg!("Changing it to: {}", new_status);
            oracle_account_data.oracle_status = new_status;
        } else {
            let new_status = true;
            msg!("Changing it to: {}", new_status);
            oracle_account_data.oracle_status = new_status;
        }

        msg!("Serializing ORACLE data account");
        oracle_account_data.serialize(&mut &mut oracle_state_account.data.borrow_mut()[..])?;
        msg!("Oracle data account serialized");
    } else {
        msg!("ORACLE data account does not exist yet");
        let (pda_oracle, pda_oracle_bump_seed) =
            Pubkey::find_program_address(&[oracle_address.as_ref()], program_id);

        msg!("Oracle PDA generated {}", pda_oracle);

        // Calculate account size required
        let account_len: usize = 2 + 32 + 2; // boolean (2bytes) + Pubkey (32 bytes) + boolean (2 bytes)

        // Calculate rent required
        let rent = Rent::get()?;
        let rent_lamports = rent.minimum_balance(account_len);

        // CREATE NEW ACCOUNT // ALREADY IN USE //
        invoke_signed(
            &system_instruction::create_account(
                initializer.key,
                oracle_state_account.key,
                rent_lamports,
                account_len.try_into().unwrap(),
                program_id,
            ),
            &[
                // account info
                initializer.clone(),
                oracle_state_account.clone(),
                system_program.clone(),
            ], // account signers seed?
            &[&[oracle_address.as_ref(), &[pda_oracle_bump_seed]]], // seed - kot seed je pri nas uporabljen "channel-id"
        )?; // proces the result

        msg!("ORACLE PDA created {}", pda_oracle);

        msg!("Unpacking ORACLE account data");
        let mut oracle_account_data =
            try_from_slice_unchecked::<OracleState>(&oracle_state_account.data.borrow()).unwrap();
        msg!("borrowed ORACLE account data");

        // oracle_account_data.is_initialized = true;
        oracle_account_data.oracle_address = oracle_address;
        oracle_account_data.oracle_status = true;
        msg!("Serializing ORACLE account data");
        oracle_account_data.serialize(&mut &mut oracle_state_account.data.borrow_mut()[..])?;
        msg!("ORACLE account data serialized");
    }

    Ok(())
}
