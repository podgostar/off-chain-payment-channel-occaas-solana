use borsh::BorshDeserialize;
use solana_program::{program_error::ProgramError, pubkey::Pubkey};

pub enum ChannelInstruction {
    ModifyOracle { oracle_address: Pubkey },
    OpenChannel { open_token_encoded: Vec<u8> },
    JoinChannel { join_token_encoded: Vec<u8> },
    LeaveChannel { leave_token_encoded: Vec<u8> },
    InviteToChannel { channel_id: String, invitee: Pubkey },
}

#[derive(BorshDeserialize)]
struct ModifyOraclePayload {
    oracle_address: Pubkey,
}

#[derive(BorshDeserialize)]
struct InviteToChannelPayload {
    channel_id: String,
    invitee: Pubkey,
}

#[derive(BorshDeserialize)]
struct JoinChannelPayload {
    channel_id: String,
}

impl ChannelInstruction {
    // Unpack inbound buffer to associated Instruction
    // The expected format for input is a Borsh serialized vector
    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        // Split the first byte of data
        let (&variant, rest) = input
            .split_first()
            .ok_or(ProgramError::InvalidInstructionData)?;
        // `try_from_slice` is one of the implementations from the BorshDeserialization trait
        // Deserializes instruction byte data into the payload struct
        //let payload = OpenChannelPayload::try_from_slice(rest).unwrap();
        // Match the first byte and return the AddMovieReview struct

        Ok(match variant {
            1 => {
                // let payload = OpenPayload::try_from_slice(rest).unwrap();
                Self::OpenChannel {
                    open_token_encoded: rest.to_vec().split_off(4), // bytes to slice // split_off = first 4 elements represent lenght
                }
            }
            2 => {
                // let payload = OpenPayload::try_from_slice(rest).unwrap();
                Self::JoinChannel {
                    join_token_encoded: rest.to_vec().split_off(4), // bytes to slice // split_off = first 4 elements represent lenght
                }
            }
            3 => Self::LeaveChannel {
                leave_token_encoded: rest.to_vec().split_off(4),
            },
            5 => {
                let payload = ModifyOraclePayload::try_from_slice(rest).unwrap();
                Self::ModifyOracle {
                    oracle_address: payload.oracle_address,
                }
            }
            6 => {
                let payload = InviteToChannelPayload::try_from_slice(rest).unwrap();
                Self::InviteToChannel {
                    channel_id: payload.channel_id,
                    invitee: payload.invitee,
                }
            }
            _ => return Err(ProgramError::InvalidInstructionData),
        })
    }
}
