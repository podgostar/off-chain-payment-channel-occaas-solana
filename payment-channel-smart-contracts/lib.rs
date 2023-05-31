use solana_program::{
    account_info::AccountInfo, entrypoint, entrypoint::ProgramResult, pubkey::Pubkey,
};

pub mod channel_state;
pub mod error;
pub mod instruction;
pub mod invite_channel_processor;
pub mod join_channel_processor;
pub mod leave_channel_processor;
pub mod modify_oracle_processor;
pub mod open_channel_processor;
pub mod oracle_state;
pub mod stakeholder_state;
pub mod verify_signature_processor;

use instruction::ChannelInstruction; // channel instruction

// Entry point is a function call process_instruction
entrypoint!(process_instruction);

// tukaj se glede na to kaj se vrne kliče funkcija!!!!!

// Inside lib.rs
pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    // Unpack called
    let instruction = ChannelInstruction::unpack(instruction_data)?;
    // Match against the data struct returned into `instruction` variable
    match instruction {
        ChannelInstruction::OpenChannel { open_token_encoded } => {
            // Make a call to `open, channel` function
            open_channel_processor::open_channel(program_id, accounts, open_token_encoded)
        }

        ChannelInstruction::JoinChannel { join_token_encoded } => {
            // Make a call to `open, channel` function
            join_channel_processor::join_channel(program_id, accounts, join_token_encoded)
        }
        ChannelInstruction::LeaveChannel {
            leave_token_encoded,
        } => {
            // Make a call to `close channel` function
            leave_channel_processor::leave_channel(program_id, accounts, leave_token_encoded)
        }

        ChannelInstruction::ModifyOracle { oracle_address } => {
            // Make a call to `modify oracle` function
            modify_oracle_processor::modify_oracle(program_id, accounts, oracle_address)
        }

        ChannelInstruction::InviteToChannel {
            channel_id,
            invitee,
        } => {
            // Make a call to `modify oracle` function
            invite_channel_processor::invite(program_id, accounts, channel_id, invitee)
        }
    }
}
