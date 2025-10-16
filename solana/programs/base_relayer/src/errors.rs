use anchor_lang::prelude::*;

#[error_code]
pub enum RelayerError {
    // Initialization (6000-6099)
    #[msg("Only the upgrade authority can initialize the relayer")]
    UnauthorizedInitialization = 6000,

    #[msg("Incorrect relayer program")]
    IncorrectRelayerProgram,

    // Configuration (6100-6199)
    #[msg("Unauthorized to update configuration")]
    UnauthorizedConfigUpdate = 6100,

    // Gas Validation (6200-6299)
    #[msg("Gas limit too low")]
    GasLimitTooLow = 6200,

    #[msg("Gas limit exceeded")]
    GasLimitExceeded,

    // Payment (6300-6399)
    #[msg("Incorrect gas fee receiver")]
    IncorrectGasFeeReceiver = 6300,
}
