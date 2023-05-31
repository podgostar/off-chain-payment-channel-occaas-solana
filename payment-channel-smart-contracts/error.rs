use solana_program::program_error::ProgramError;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum PaymentChannelError {
    #[error("Payment Channel Error")]
    Error,
}

impl From<PaymentChannelError> for ProgramError {
    fn from(e: PaymentChannelError) -> Self {
        ProgramError::Custom(e as u32)
    }
}
