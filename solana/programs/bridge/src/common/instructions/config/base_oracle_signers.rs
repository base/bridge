use anchor_lang::prelude::*;

use crate::common::{BaseOracleConfig, SetBridgeConfig};

/// Set or update the oracle signer configuration.
///
/// Updates the `oracle_signers` account with a new approval `threshold` and a
/// new list of unique EVM signer addresses. This instruction is used to rotate
/// oracle keys or adjust the required threshold for output root attestations.
pub fn set_oracle_signers_handler(
    ctx: Context<SetBridgeConfig>,
    cfg: BaseOracleConfig,
) -> Result<()> {
    cfg.validate()?;
    ctx.accounts.bridge.base_oracle_config = cfg;
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::common::{BaseOracleConfig, MAX_SIGNER_COUNT};

    fn base_cfg(threshold: u8, signer_count: u8, first_two_same: bool) -> BaseOracleConfig {
        let mut signers = [[0u8; 20]; MAX_SIGNER_COUNT as usize];
        if signer_count > 0 {
            signers[0] = [1u8; 20];
        }
        if signer_count > 1 {
            signers[1] = if first_two_same { [1u8; 20] } else { [2u8; 20] };
        }

        BaseOracleConfig {
            threshold,
            signer_count,
            signers,
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
        let oracle = BaseOracleConfig {
            threshold: 2,
            signer_count: 2,
            signers: {
                let mut a = [[0u8; 20]; MAX_SIGNER_COUNT as usize];
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
