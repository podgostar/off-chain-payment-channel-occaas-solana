use borsh::BorshSerialize;
use solana_program::{
    account_info::{next_account_info, AccountInfo},
    borsh::try_from_slice_unchecked,
    entrypoint::ProgramResult,
    msg,
    program::invoke_signed,
    pubkey::Pubkey,
    system_instruction,
    sysvar::{rent::Rent, Sysvar},
};

use crate::channel_state::ChannelState;
use crate::error::PaymentChannelError;
use crate::stakeholder_state::StakeholderState;

pub fn invite(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    channel_id: String,
    invitee: Pubkey,
) -> ProgramResult {
    // Get Account iterator
    let account_info_iter = &mut accounts.iter();

    // Get accounts
    let msg_sender = next_account_info(account_info_iter)?;
    let pda_channel_account = next_account_info(account_info_iter)?;
    let pda_stakeholder_account = next_account_info(account_info_iter)?;
    let pda_invitee_account = next_account_info(account_info_iter)?;
    let system_program = next_account_info(account_info_iter)?;

    let (pda_channel, _) =
        Pubkey::find_program_address(&[channel_id.as_bytes().as_ref()], program_id);

    if pda_channel != *pda_channel_account.key {
        msg!("pda_channel != pda_channel_account.key; invalid seeds");
        return Err(PaymentChannelError::Error.into());
    }

    let (pda_stakeholder, _) = Pubkey::find_program_address(
        &[channel_id.as_bytes().as_ref(), msg_sender.key.as_ref()],
        program_id,
    );

    if pda_stakeholder != *pda_stakeholder_account.key {
        msg!("pda_stakeholder != pda_stakeholder_account.key; invalid seeds");
        return Err(PaymentChannelError::Error.into());
    }

    let (pda_invitee, pda_invitee_bump_seed) = Pubkey::find_program_address(
        &[channel_id.as_bytes().as_ref(), invitee.as_ref()],
        program_id,
    );

    if pda_invitee != *pda_invitee_account.key {
        msg!("pda_invitee != pda_invitee_account.key; invalid seeds");
        return Err(PaymentChannelError::Error.into());
    }

    // Load Stakeholder PDA
    let pda_stakeholder_account_data = match try_from_slice_unchecked::<StakeholderState>(
        &pda_stakeholder_account.data.borrow(),
    ) {
        Ok(data) => data,
        Err(_) => {
            msg!("Failed to deserialize Stakeholder PDA data. Stakeholder (msg.sender) is not part of the channel");
            return Err(PaymentChannelError::Error.into());
        }
    };

    // Sender must be active
    if pda_stakeholder_account_data.status != 2 {
        // sender must have status active
        msg!("msg.sender is not part of the channel");
        return Err(PaymentChannelError::Error.into());
    }

    let pda_channel_account_data =
        match try_from_slice_unchecked::<ChannelState>(&pda_channel_account.data.borrow()) {
            Ok(data) => data,
            Err(_) => {
                msg!("Failed to deserealize PDA_CHANNEL_ACCOUNT_DATA; Channel does not exists");
                return Err(PaymentChannelError::Error.into());
            }
        };

    // check that channel name = as in loader, and check that sender is invited
    if pda_channel_account_data.channel_id != channel_id {
        msg!("Wrong Channel ID");
        return Err(PaymentChannelError::Error.into());
    }

    // Channel must be opened
    if pda_channel_account_data.current_status != 1 {
        msg!("Channel status != opened");
        return Err(PaymentChannelError::Error.into());
    }

    // Create pda_invitee
    let pda_invitee_account_len: usize = 32 + 1 + 8; // // Pubkey (32 bytes) + u8 (1 byte) + u64 (8 bytes)

    // Calculate rent required
    let pda_invitee_rent = Rent::get()?;
    let pda_invitee_rent_lamports = pda_invitee_rent.minimum_balance(pda_invitee_account_len);

    // Create PDA (Stakeholder)
    match invoke_signed(
        &system_instruction::create_account(
            msg_sender.key,
            pda_invitee_account.key,
            pda_invitee_rent_lamports,
            pda_invitee_account_len.try_into().unwrap(),
            program_id,
        ),
        &[
            msg_sender.clone(),
            pda_invitee_account.clone(),
            system_program.clone(),
        ],
        &[&[
            channel_id.as_bytes().as_ref(),
            invitee.as_ref(),
            &[pda_invitee_bump_seed],
        ]],
    ) {
        Ok(()) => (),
        Err(_) => {
            msg!("Stakeholder is already part of channel");
            return Err(PaymentChannelError::Error.into());
        }
    }

    let mut pda_invitee_account_data =
        try_from_slice_unchecked::<StakeholderState>(&pda_invitee_account.data.borrow()).unwrap();

    // Assigning values
    pda_invitee_account_data.stakeholder_address = invitee;
    pda_invitee_account_data.balance = 0;
    pda_invitee_account_data.status = 1; // ACTIVE

    // Serialize PDA Stakeholder account - data
    pda_invitee_account_data.serialize(&mut &mut pda_invitee_account.data.borrow_mut()[..])?;

    msg!("Stakeholder succesfuly invited to channel!");

    Ok(())
}
