use borsh::BorshDeserialize;
use borsh::BorshSerialize;
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    borsh::try_from_slice_unchecked,
    entrypoint::ProgramResult,
    msg,
    program::invoke,
    pubkey::Pubkey,
    system_instruction,
};

use crate::channel_state::ChannelState;
use crate::error::PaymentChannelError;
use crate::oracle_state::OracleState;
use crate::stakeholder_state::StakeholderState;
use crate::verify_signature_processor::verify_ed25519;

#[derive(BorshSerialize, BorshDeserialize, Debug)]
struct JoinTokenPayload {
    encoded_data: Vec<u8>,
    prev_state: String,
    sig_oracle: [u8; 64],
}

use anchor_lang::prelude::*;

#[derive(BorshDeserialize)]
struct JoinTokenDataSchema {
    // ENCODED DATA
    action: u8,
    channelid: String,
    address: Pubkey,
    balance: u64,
    sender: Pubkey,
    sig_sender: [u8; 64], // to be included later (maybe)
}

pub fn join_channel(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    join_token_encoded: Vec<u8>,
    // channel_id: String,
) -> ProgramResult {
    // Get Account iterator
    let account_info_iter = &mut accounts.iter();

    // Get accounts
    let msg_sender = next_account_info(account_info_iter)?;
    let pda_channel_account = next_account_info(account_info_iter)?;
    let pda_stakeholder_account = next_account_info(account_info_iter)?;
    let pda_oracle_account = next_account_info(account_info_iter)?;
    let sysvar_account = next_account_info(account_info_iter)?;
    let system_program = next_account_info(account_info_iter)?;

    /*
        0. Load join_token
        1. Checks that provided PDA's are those as they should be / TO-DO after join_token will be in play - seeds in findprogram (for pda) should came from join_token
        2. Loading of PDA ACCOUNTS data
        3. Checks
        4. Verification of token signature
        5. Assign values (inluding 'transfer')
        6. Emit event
    */

    let join_token_decoded = match JoinTokenPayload::try_from_slice(join_token_encoded.as_slice()) {
        Ok(payload) => payload,
        Err(_) => {
            msg!("Failed to decode join_token");
            return Err(PaymentChannelError::Error.into());
        }
    };

    let join_token_core_data_decoded_result =
        JoinTokenDataSchema::try_from_slice(join_token_decoded.encoded_data.as_slice());

    let join_token_core_data_decoded = match join_token_core_data_decoded_result {
        Ok(data) => data,
        Err(_) => {
            msg!("Failed to decode join_token_core_data");
            return Err(PaymentChannelError::Error.into());
        }
    };

    // Load and check PDA_CHANNEL / CHANNEL ACCOUNT
    let (pda_channel, _) = Pubkey::find_program_address(
        &[join_token_core_data_decoded.channelid.as_bytes().as_ref()],
        program_id,
    );

    if pda_channel != *pda_channel_account.key {
        msg!("pda_channel != pda_channel_account.key; invalid seeds");
        return Err(PaymentChannelError::Error.into());
    }

    let mut pda_channel_account_data =
        match try_from_slice_unchecked::<ChannelState>(&pda_channel_account.data.borrow()) {
            Ok(data) => data,
            Err(_) => {
                msg!("Failed to deserealize PDA_CHANNEL_ACCOUNT_DATA; Channel does not exists");
                return Err(PaymentChannelError::Error.into());
            }
        };

    // Load and check PDA_STAKEHOLDER / STAKEHOLDER ACCOUNT
    let (pda_stakeholder, _) = Pubkey::find_program_address(
        &[
            join_token_core_data_decoded.channelid.as_bytes().as_ref(),
            msg_sender.key.as_ref(),
        ],
        program_id,
    );

    if pda_stakeholder != *pda_stakeholder_account.key {
        msg!("pda_stakeholder != pda_stakeholder_account.key; invalid seeds");
        return Err(PaymentChannelError::Error.into());
    }

    let mut pda_stakeholder_account_data = match try_from_slice_unchecked::<StakeholderState>(
        &pda_stakeholder_account.data.borrow(),
    ) {
        Ok(data) => data,
        Err(_) => {
            msg!("Failed to deserialize Stakeholder PDA data. Stakeholder (msg.sender) is not part of the channel");
            return Err(PaymentChannelError::Error.into());
        }
    };

    let oracle_account_data =
        match try_from_slice_unchecked::<OracleState>(&pda_oracle_account.data.borrow()) {
            Ok(data) => data,
            Err(_) => {
                msg!("Oracle deserialization error");
                return Err(PaymentChannelError::Error.into());
            }
        };

    // Checks (Channel status = opened, Stakeholder status = invited, channelid matches, action in token = 2, balance > 0, stakeholder sender)
    if pda_channel_account_data.channel_id != join_token_core_data_decoded.channelid {
        msg!("join_token.channel_id != channel.channel_id");
        return Err(PaymentChannelError::Error.into());
    }

    if pda_channel_account_data.current_status != 1 {
        msg!("Channel is not opened");
        return Err(PaymentChannelError::Error.into());
    }

    // if pda_stakeholder_account_data.stakeholder_address !=
    if pda_stakeholder_account_data.status != 1 {
        msg!("Stakeholder status != invited");
        return Err(PaymentChannelError::Error.into());
    }

    if join_token_decoded.prev_state != "0" {
        msg!("Wrong 'prev_state' defined within provided token.");
        return Err(PaymentChannelError::Error.into());
    }

    // Sender should be the same as defined within token
    if *msg_sender.key != join_token_core_data_decoded.sender {
        msg!("Sender of this TX is not the same as defined in token");
        return Err(PaymentChannelError::Error.into());
    }

    if join_token_core_data_decoded.balance <= 0 {
        msg!("Provided amount is too low");
        return Err(PaymentChannelError::Error.into());
    }

    match verify_ed25519(
        sysvar_account,
        oracle_account_data.oracle_address, // pub key
        join_token_decoded.encoded_data,    // msg
        join_token_decoded.sig_oracle,      // sig
    ) {
        Ok(_) => msg!("Oracle signature succesfuly verified!"),
        Err(_) => {
            msg!("Oracle signature FAILED!");
            return Err(PaymentChannelError::Error.into());
        }
    }

    // assign values
    pda_channel_account_data.num_of_active_stakeholders += 1;

    // serialize
    pda_channel_account_data.serialize(&mut &mut pda_channel_account.data.borrow_mut()[..])?;

    // assign values
    pda_stakeholder_account_data.balance = join_token_core_data_decoded.balance;
    pda_stakeholder_account_data.status = 2;

    // serialize
    pda_stakeholder_account_data
        .serialize(&mut &mut pda_stakeholder_account.data.borrow_mut()[..])?;

    // // Send join amount to new channel
    let join_amount_transfer = system_instruction::transfer(
        msg_sender.key,          // From account
        pda_channel_account.key, // To account //
        join_token_core_data_decoded.balance,
    );

    msg!("Transfering Join amount (SOL) to PDA Channel");
    // invoke join_amount transfer to channel address
    invoke(
        &join_amount_transfer,
        &[
            msg_sender.clone(),
            pda_channel_account.clone(),
            system_program.clone(),
        ],
    )?;
    msg!("Transfer completed, Stakeholder Joined!");

    msg!("JoinEvent: {:?}", join_token_encoded); // "event"

    Ok(())
}
