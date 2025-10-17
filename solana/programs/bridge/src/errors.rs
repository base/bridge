use anchor_lang::prelude::*;

#[error_code]
pub enum BridgeError {
    // Common Errors (6000-6099)
    #[msg("Bridge is currently paused")]
    BridgePaused = 6000,

    #[msg("Incorrect bridge program")]
    IncorrectBridgeProgram,

    #[msg("Incorrect gas fee receiver")]
    IncorrectGasFeeReceiver,

    // Authorization & Access Control (6100-6199)
    #[msg("Only the upgrade authority can initialize the bridge")]
    UnauthorizedInitialization = 6100,

    #[msg("Unauthorized to update configuration")]
    UnauthorizedConfigUpdate,

    // Buffer Management (6200-6299)
    #[msg("Only the owner can close this buffer")]
    BufferUnauthorizedClose = 6200,

    #[msg("Only the owner can append to this buffer")]
    BufferUnauthorizedAppend,

    #[msg("Call buffer size exceeds maximum allowed size")]
    BufferMaxSizeExceeded,

    // Signature & Cryptography (6300-6399)
    #[msg("Invalid recovery ID")]
    InvalidRecoveryId = 6300,

    #[msg("Signature verification failed")]
    SignatureVerificationFailed,

    #[msg("Insufficient base oracle signatures to meet threshold")]
    InsufficientBaseSignatures,

    #[msg("Insufficient partner oracle signatures to meet threshold")]
    InsufficientPartnerSignatures,

    // MMR Proofs (6400-6499)
    #[msg("Invalid proof")]
    InvalidProof = 6400,

    #[msg("MMR should be empty")]
    MmrShouldBeEmpty,

    #[msg("MMR is empty")]
    EmptyMmr,

    #[msg("Leaf's mountain not found")]
    LeafMountainNotFound,

    #[msg("Insufficient proof elements for intra-mountain path")]
    InsufficientProofElementsForIntraMountainPath,

    #[msg("Insufficient proof elements for other mountain peaks")]
    InsufficientProofElementsForOtherMountainPeaks,

    #[msg("Unused proof elements remaining")]
    UnusedProofElementsRemaining,

    #[msg("No peaks found for non-empty MMR")]
    NoPeaksFoundForNonEmptyMmr,

    // Message Proving & Relaying (6500-6599)
    #[msg("Invalid message hash")]
    InvalidMessageHash = 6500,

    #[msg("Message already executed")]
    AlreadyExecuted,

    #[msg("Incorrect block number")]
    IncorrectBlockNumber,

    // Token Validation (6600-6699)
    #[msg("Mint does not match local token")]
    MintDoesNotMatchLocalToken = 6600,

    #[msg("Token account does not match to address")]
    TokenAccountDoesNotMatchTo,

    #[msg("Incorrect token vault")]
    IncorrectTokenVault,

    #[msg("Mint is a wrapped token")]
    MintIsWrappedToken,

    #[msg("Incorrect to")]
    IncorrectTo,

    #[msg("Incorrect sol vault")]
    IncorrectSolVault,

    // Token Metadata (6700-6799)
    #[msg("Remote token not found")]
    RemoteTokenNotFound = 6700,

    #[msg("Scaler exponent not found")]
    ScalerExponentNotFound,

    #[msg("Invalid remote token")]
    InvalidRemoteToken,

    #[msg("Invalid scaler exponent")]
    InvalidScalerExponent,

    #[msg("Mint is not a token 2022 mint")]
    MintIsNotFromToken2022,

    #[msg("Mint is not a valid wrapped token PDA")]
    MintIsNotWrappedTokenPda,

    // Bridge Configuration (6800-6899)
    #[msg("Threshold must be <= number of signers")]
    InvalidThreshold = 6800,

    #[msg("Too many signers (max 32)")]
    TooManySigners,

    #[msg("Duplicate signer found")]
    DuplicateSigner,

    #[msg("Invalid partner threshold")]
    InvalidPartnerThreshold,

    #[msg("Invalid denominator")]
    InvalidDenominator,

    #[msg("Invalid window duration seconds")]
    InvalidWindowDurationSeconds,

    #[msg("Invalid gas cost scaler dp")]
    InvalidGasCostScalerDp,

    #[msg("Invalid block interval requirement")]
    InvalidBlockIntervalRequirement,

    // Call Type Validation (6900-6999)
    #[msg("Creation with non-zero target")]
    CreationWithNonZeroTarget = 6900,

    #[msg("Zero address")]
    ZeroAddress,
}
