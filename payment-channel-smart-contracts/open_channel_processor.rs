use borsh::BorshDeserialize;
use borsh::BorshSerialize;
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    borsh::try_from_slice_unchecked,
    entrypoint::ProgramResult,
    msg,
    program::invoke,
    program::invoke_signed,
    pubkey::Pubkey,
    system_instruction,
    sysvar::{rent::Rent, Sysvar},
};

use crate::channel_state::ChannelState;
use crate::error::PaymentChannelError;
use crate::oracle_state::OracleState;
use crate::stakeholder_state::StakeholderState;
use crate::verify_signature_processor::verify_ed25519;

#[derive(BorshSerialize, BorshDeserialize, Debug)]
struct OpenTokenPayload {
    encoded_data: Vec<u8>,
    prev_state: String,
    sig_oracle: [u8; 64],
}

#[derive(BorshDeserialize)]
struct OpenTokenDataSchema {
    // ENCODED DATA
    action: u8,
    channelid: String,
    address: Pubkey,
    balance: u64,
    sender: Pubkey,
    sig_sender: [u8; 64], // to be checked maybe later
}

pub fn open_channel(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    open_token_encoded: Vec<u8>, // open_token_encoded: String
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

    let open_token_decoded = match OpenTokenPayload::try_from_slice(open_token_encoded.as_slice()) {
        Ok(payload) => payload,
        Err(_) => {
            msg!("Failed to decode open_token");
            return Err(PaymentChannelError::Error.into());
        }
    };

    // Deserelize open_token
    let open_token_core_data_decoded_result =
        OpenTokenDataSchema::try_from_slice(open_token_decoded.encoded_data.as_slice());

    let open_token_core_data_decoded = match open_token_core_data_decoded_result {
        Ok(data) => data,
        Err(_) => {
            msg!("Failed to decode open_token_core_data");
            return Err(PaymentChannelError::Error.into());
        }
    };

    // Check data
    if open_token_core_data_decoded.action != 1 {
        msg!("Wrong 'action' defined within provided token.");
        return Err(PaymentChannelError::Error.into());
    }

    if open_token_decoded.prev_state != "0" {
        msg!("Wrong 'prev_state' defined within provided token.");
        return Err(PaymentChannelError::Error.into());
    }

    // Sender should be the same as defined within token
    if *msg_sender.key != open_token_core_data_decoded.sender {
        msg!("Sender of this TX is not the same as defined in token");
        return Err(PaymentChannelError::Error.into());
    }

    if open_token_core_data_decoded.balance <= 0 {
        msg!("Provided amount is too low");
        return Err(PaymentChannelError::Error.into());
    }

    // Unpack oracle account
    let oracle_account_data =
        match try_from_slice_unchecked::<OracleState>(&pda_oracle_account.data.borrow()) {
            Ok(data) => data,
            Err(_) => {
                msg!("Failed to deserialize ORACLE Account - wrong Oracle account provided");
                return Err(PaymentChannelError::Error.into());
            }
        };

    // Verification of 'oracle' signature (TO-DO - if possible, consider also swithicng back to old strategy that includes verification of both signatures!)
    msg!("Verification of token signature (sig_oracle)");
    match verify_ed25519(
        sysvar_account,
        oracle_account_data.oracle_address, // pub key
        open_token_decoded.encoded_data,    // msg
        open_token_decoded.sig_oracle,      // sig
    ) {
        Ok(_) => msg!("Oracle signature succesfuly verified!"),
        Err(_) => {
            msg!("Verification of open_token (sig_oracle) FAILED");
            return Err(PaymentChannelError::Error.into());
        }
    }

    let (pda_stakeholder, pda_stakeholder_bump_seed) = Pubkey::find_program_address(
        &[
            open_token_core_data_decoded.channelid.as_bytes().as_ref(),
            open_token_core_data_decoded.sender.as_ref(),
        ],
        program_id,
    );

    if pda_stakeholder != *pda_stakeholder_account.key {
        msg!("pda_stakeholder != pda_stakeholder_account.key; invalid seeds");
        return Err(PaymentChannelError::Error.into());
    }

    // // Calculate account size required
    // // From stakeholder_state.rs:
    // // - pub stakeholder_address: Pubkey,
    // // - pub status: u8, // { 1 = INVITED, 2 = ACTIVE, 3 = INACTIVE }
    // // - pub balance: u64,
    let pda_stakeholder_account_len: usize = 32 + 1 + 8; // // Pubkey (32 bytes) + u8 (1 byte) + u64 (8 bytes)

    // Calculate rent required
    let pda_stakeholder_rent = Rent::get()?;
    let pda_stakeholder_rent_lamports =
        pda_stakeholder_rent.minimum_balance(pda_stakeholder_account_len);

    // Create PDA (Stakeholder)
    match invoke_signed(
        &system_instruction::create_account(
            msg_sender.key,
            pda_stakeholder_account.key,
            pda_stakeholder_rent_lamports,
            pda_stakeholder_account_len.try_into().unwrap(),
            program_id,
        ),
        &[
            msg_sender.clone(),
            pda_stakeholder_account.clone(),
            system_program.clone(),
        ],
        &[&[
            open_token_core_data_decoded.channelid.as_bytes().as_ref(),
            open_token_core_data_decoded.sender.as_ref(),
            &[pda_stakeholder_bump_seed],
        ]], // seed = channelid+stakeholderPubKey (+ bump seed)
    ) {
        Ok(()) => (),
        Err(_) => {
            msg!("Stakeholder is already part of channel");
            return Err(PaymentChannelError::Error.into());
        }
    }

    let mut stakeholder_account_data =
        try_from_slice_unchecked::<StakeholderState>(&pda_stakeholder_account.data.borrow())
            .unwrap();

    // Assigning values
    stakeholder_account_data.stakeholder_address = open_token_core_data_decoded.address;
    stakeholder_account_data.balance = open_token_core_data_decoded.balance;
    stakeholder_account_data.status = 2; // 2 = active

    // Serialize PDA Stakeholder account - data
    stakeholder_account_data.serialize(&mut &mut pda_stakeholder_account.data.borrow_mut()[..])?;

    // Creation of Channel PDA
    let (pda_channel, pda_channel_bump_seed) = Pubkey::find_program_address(
        &[open_token_core_data_decoded.channelid.as_bytes().as_ref()],
        program_id,
    );

    if pda_channel != *pda_channel_account.key {
        msg!("pda_channel != pda_channel_account.key; invalid seeds");
        return Err(PaymentChannelError::Error.into());
    }

    // Calculate account size required
    // let pda_channel_account_len: usize =
    // 4 + open_token_core_data_decoded.channelid.len() + 32 + 320 + 8; // (4bytes = dynamic string (string len) + channelid.len + pubkey + 10xPubKey + u8) !!!!! (we must be more specific here!!! TODO)
    let pda_channel_account_len: usize =
        4 + open_token_core_data_decoded.channelid.len() + 32 + 1 + 1;

    // // Calculate rent required
    let pda_channel_rent = Rent::get()?;
    let pda_channel_rent_lamports = pda_channel_rent.minimum_balance(pda_channel_account_len);

    // CREATE NEW PDA (CHANNEL_ID => CHANNEL)
    match invoke_signed(
        &system_instruction::create_account(
            msg_sender.key,
            pda_channel_account.key, 
            pda_channel_rent_lamports,
            pda_channel_account_len.try_into().unwrap(),
            program_id,
        ),
        &[
            msg_sender.clone(),
            pda_channel_account.clone(),
            system_program.clone(),
        ],
        &[&[
            open_token_core_data_decoded.channelid.as_bytes().as_ref(),
            &[pda_channel_bump_seed],
        ]], // channel pda seed = channelid
    ) {
        Ok(()) => (),
        Err(_) => {
            msg!("Channel with provided 'channel_id' already exists!");
            return Err(PaymentChannelError::Error.into());
        }
    }

    // msg!("Unpacking CHANNEL account data");
    let mut pda_channel_account_data =
        try_from_slice_unchecked::<ChannelState>(&pda_channel_account.data.borrow()).unwrap();
    // msg!("Borrowed CHANNEL account data");

    // // ASSIGN VALUES
    pda_channel_account_data.channel_id = open_token_core_data_decoded.channelid;
    pda_channel_account_data.oracle_address = oracle_account_data.oracle_address;
    pda_channel_account_data.current_status = 1; // 1 = OPENED
    pda_channel_account_data.num_of_active_stakeholders = 1;

    pda_channel_account_data.serialize(&mut &mut pda_channel_account.data.borrow_mut()[..])?;

    // Send open_amount to new channel
    let open_amount_transfer = system_instruction::transfer(
        msg_sender.key,                       // From account
        pda_channel_account.key,              // To account
        open_token_core_data_decoded.balance, // Amount
    );

    msg!("Transfering open amount (SOL) to PDA Channel");
    // invoke open_amount transfer to channel address
    invoke(
        &open_amount_transfer,
        &[
            msg_sender.clone(),
            pda_channel_account.clone(),
            system_program.clone(),
        ],
    )?;
    msg!("Transfer completed, Channel Opened!");

    Ok(())
}
