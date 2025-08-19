use anchor_lang::prelude::*;

use crate::common::{
    bridge::Bridge, state::oracle_signers::OracleSigners, BaseOracleConfig, BRIDGE_SEED,
    ORACLE_SIGNERS_SEED,
};

/// Accounts for initializing or updating the oracle signers list and threshold.
#[derive(Accounts)]
#[instruction(threshold: u8, signers: Vec<[u8;20]>)]
pub struct SetOracleSigners<'info> {
    /// Canonical bridge state used to authorize the change.
    ///
    /// Constraints:
    /// - `has_one = guardian` ensures only the current guardian can update.
    /// - PDA derived from `BRIDGE_SEED`.
    #[account(
        mut,
        has_one = guardian,
        seeds = [BRIDGE_SEED],
        bump,
    )]
    pub bridge: Account<'info, Bridge>,

    /// Guardian who must authorize the update.
    pub guardian: Signer<'info>,

    /// PDA storing the oracle signer set and required threshold.
    ///
    /// Constraints:
    /// - PDA derived from `ORACLE_SIGNERS_SEED`.
    /// - Marked `mut` because the instruction updates its fields.
    #[account(
        mut,
        seeds = [ORACLE_SIGNERS_SEED],
        bump,
    )]
    pub oracle_signers: Account<'info, OracleSigners>,

    /// System program (required by Anchor account machinery; no direct writes).
    pub system_program: Program<'info, System>,
}

/// Set or update the oracle signer configuration.
///
/// Updates the `oracle_signers` account with a new approval `threshold` and a
/// new list of unique EVM signer addresses. This instruction is used to rotate
/// oracle keys or adjust the required threshold for output root attestations.
pub fn set_oracle_signers_handler(
    ctx: Context<SetOracleSigners>,
    cfg: BaseOracleConfig,
) -> Result<()> {
    cfg.validate()?;
    ctx.accounts.oracle_signers.threshold = cfg.oracle_threshold;
    ctx.accounts.oracle_signers.signer_count = cfg.signer_count;
    ctx.accounts.oracle_signers.signers = cfg.oracle_signer_addrs;
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::common::{state::oracle_signers::OracleSigners, BaseOracleConfig, MAX_SIGNER_COUNT};

    fn base_cfg(threshold: u8, signer_count: u8, first_two_same: bool) -> BaseOracleConfig {
        let mut addrs: [[u8; 20]; MAX_SIGNER_COUNT] = [[0u8; 20]; MAX_SIGNER_COUNT];
        if signer_count > 0 {
            addrs[0] = [1u8; 20];
        }
        if signer_count > 1 {
            addrs[1] = if first_two_same { [1u8; 20] } else { [2u8; 20] };
        }

        BaseOracleConfig {
            oracle_threshold: threshold,
            signer_count,
            oracle_signer_addrs: addrs,
        }
    }

    #[test]
    fn validate_ok() {
        let cfg = base_cfg(1, 2, false);
        assert!(cfg.validate().is_ok());
    }

    #[test]
    fn validate_invalid_threshold_zero() {
        let cfg = base_cfg(0, 1, false);
        let err = cfg.validate().unwrap_err();
        let msg = err.to_string();
        assert!(msg.contains("InvalidThreshold"));
    }

    #[test]
    fn validate_invalid_threshold_gt_count() {
        let cfg = base_cfg(3, 2, false);
        let err = cfg.validate().unwrap_err();
        let msg = err.to_string();
        assert!(msg.contains("InvalidThreshold"));
    }

    #[test]
    fn validate_too_many_signers() {
        let cfg = base_cfg(1, 17, false);
        let err = cfg.validate().unwrap_err();
        let msg = err.to_string();
        assert!(msg.contains("TooManySigners"));
    }

    #[test]
    fn validate_duplicate_signer() {
        let cfg = base_cfg(2, 2, true);
        let err = cfg.validate().unwrap_err();
        let msg = err.to_string();
        assert!(msg.contains("DuplicateSigner"));
    }

    #[test]
    fn oracle_signers_helpers() {
        let oracle = OracleSigners {
            threshold: 2,
            signer_count: 2,
            signers: {
                let mut a = [[0u8; 20]; MAX_SIGNER_COUNT];
                a[0] = [1u8; 20];
                a[1] = [2u8; 20];
                a
            },
        };

        assert!(oracle.contains(&[1u8; 20]));
        assert!(oracle.contains(&[2u8; 20]));
        assert!(!oracle.contains(&[3u8; 20]));

        let approvals = oracle.count_approvals(&[[1u8; 20], [3u8; 20]]);
        assert_eq!(approvals, 1);
    }
}
