use borsh::BorshDeserialize;
use borsh::BorshSerialize;
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    borsh::try_from_slice_unchecked,
    entrypoint::ProgramResult,
    msg,
    pubkey::Pubkey,
};

use crate::channel_state::ChannelState; // channel state
use crate::error::PaymentChannelError;
use crate::oracle_state::OracleState;
use crate::stakeholder_state::StakeholderState; // channel state
use crate::verify_signature_processor::verify_ed25519;

#[derive(BorshSerialize, BorshDeserialize, Debug)]
struct LeaveTokenPayload {
    encoded_data: Vec<u8>,
    prev_state: String,
    sig_oracle: [u8; 64],
}

#[derive(BorshDeserialize)]
struct LeaveTokenDataSchema {
    // ENCODED DATA
    action: u8,
    channelid: String,
    address: Pubkey,
    balance: u64,
    sender: Pubkey,
    sig_sender: [u8; 64], // to be checked maybe later
}

pub fn leave_channel(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    leave_token_encoded: Vec<u8>,
) -> ProgramResult {
    // Logging instruction data that was passed in
    msg!("Closing payment channel...");

    // Get Account iterator
    let account_info_iter = &mut accounts.iter();

    // Get accounts
    let msg_sender = next_account_info(account_info_iter)?;
    let pda_channel_account = next_account_info(account_info_iter)?;
    let pda_stakeholder_account = next_account_info(account_info_iter)?;
    let pda_oracle_account = next_account_info(account_info_iter)?;
    let sysvar_account = next_account_info(account_info_iter)?;

    let leave_token_decoded =
        match LeaveTokenPayload::try_from_slice(leave_token_encoded.as_slice()) {
            Ok(payload) => payload,
            Err(_) => {
                msg!("Failed to decode open_token");
                return Err(PaymentChannelError::Error.into());
            }
        };

    // Deserealize open_token
    let leave_token_core_data_decoded_result =
        LeaveTokenDataSchema::try_from_slice(leave_token_decoded.encoded_data.as_slice());

    let leave_token_core_data_decoded = match leave_token_core_data_decoded_result {
        Ok(data) => data,
        Err(_) => {
            msg!("Failed to decode leave_token_core_data");
            return Err(PaymentChannelError::Error.into());
        }
    };

    // Load and check PDA_CHANNEL / CHANNEL ACCOUNT
    let (pda_channel, _) = Pubkey::find_program_address(
        &[leave_token_core_data_decoded.channelid.as_bytes().as_ref()],
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
            leave_token_core_data_decoded.channelid.as_bytes().as_ref(),
            msg_sender.key.as_ref(),
        ],
        program_id,
    );

    msg!("PDA_STAKEHOLDER: {}", pda_stakeholder);
    msg!(
        "PDA_STAKEHOLDER_ACCOUNT.KEY: {}",
        pda_stakeholder_account.key
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

    // Unpack oracle account
    let oracle_account_data =
        match try_from_slice_unchecked::<OracleState>(&pda_oracle_account.data.borrow()) {
            Ok(data) => data,
            Err(_) => {
                msg!("Failed to deserialize ORACLE Account - wrong Oracle account provided");
                return Err(PaymentChannelError::Error.into());
            }
        };

    // Checks (Channel status = opened, Stakeholder status = invited, channelid matches, action in token = 2, balance > 0, stakeholder sender)
    if pda_channel_account_data.channel_id != leave_token_core_data_decoded.channelid {
        msg!("leave_token_core_data_decoded.channel_id != channel.channel_id");
        return Err(PaymentChannelError::Error.into());
    }

    if pda_channel_account_data.current_status != 1 {
        msg!("Channel is not opened");
        return Err(PaymentChannelError::Error.into());
    }

    // if pda_stakeholder_account_data.stakeholder_address !=
    if pda_stakeholder_account_data.status != 2 {
        msg!("Stakeholder status != active");
        return Err(PaymentChannelError::Error.into());
    }

    if !leave_token_decoded.prev_state.contains("/ipfs/") {
        msg!("Wrong 'prev_state' defined within provided token.");
        return Err(PaymentChannelError::Error.into());
    }

    // Sender should be the same as defined within token
    if *msg_sender.key != leave_token_core_data_decoded.sender {
        msg!("Sender of this TX is not the same as defined in token");
        return Err(PaymentChannelError::Error.into());
    }

    if leave_token_core_data_decoded.balance <= 0 {
        msg!("Provided amount is too low");
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

    // Verification of 'oracle' signature (TO-DO - if possible, consider also swithicng back to old strategy that includes verification of both signatures!)
    msg!("Verification of token signature (sig_oracle)");
    match verify_ed25519(
        sysvar_account,
        oracle_account_data.oracle_address, // pub key
        leave_token_decoded.encoded_data,   // msg
        leave_token_decoded.sig_oracle,     // sig
    ) {
        Ok(_) => msg!("Oracle signature succesfuly verified!"),
        Err(_) => {
            msg!("Verification of open_token (sig_oracle) FAILED");
            return Err(PaymentChannelError::Error.into());
        }
    }

    // assign values
    pda_stakeholder_account_data.balance = 0;
    pda_stakeholder_account_data.status = 3; // 3 = inactive

    // Serialize PDA Stakeholder account - data
    pda_stakeholder_account_data
        .serialize(&mut &mut pda_stakeholder_account.data.borrow_mut()[..])?;

    // ASSIGN VALUES
    pda_channel_account_data.num_of_active_stakeholders -= 1;

    // // ASSIGN VALUES
    if pda_channel_account_data.num_of_active_stakeholders == 0 {
        pda_channel_account_data.current_status = 2; // 1 = OPENED // 2 = CLOSED
    }

    pda_channel_account_data.serialize(&mut &mut pda_channel_account.data.borrow_mut()[..])?;

    if **pda_channel_account.try_borrow_lamports()? < leave_token_core_data_decoded.balance {
        return Err(PaymentChannelError::Error.into());
    }

    msg!(
        "amount to be transfered: {}",
        leave_token_core_data_decoded.balance
    );

    **pda_channel_account.try_borrow_mut_lamports()? -= leave_token_core_data_decoded.balance;
    **msg_sender.try_borrow_mut_lamports()? += leave_token_core_data_decoded.balance;

    Ok(())
}
