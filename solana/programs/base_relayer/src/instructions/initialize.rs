use anchor_lang::prelude::*;

use crate::{constants::CFG_SEED, Cfg};

#[derive(Accounts)]
pub struct Initialize<'info> {
    /// The account that pays for the transaction and bridge account creation.
    /// Must be mutable to deduct lamports for account rent.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The relayer config state account that tracks fee parameters.
    /// - Uses PDA with CFG_SEED for deterministic address
    /// - Mutable to update EIP1559 fee data
    #[account(init, payer = payer, seeds = [CFG_SEED], bump, space = 8 + Cfg::INIT_SPACE)]
    pub cfg: Account<'info, Cfg>,

    /// The guardian account that will have administrative authority over the bridge.
    /// Must be a signer to prove ownership of the guardian key. The payer and guardian
    /// may be distinct signers.
    pub guardian: Signer<'info>,

    /// System program required for creating new accounts.
    /// Used internally by Anchor for account initialization.
    pub system_program: Program<'info, System>,
}

pub fn initialize_handler(ctx: Context<Initialize>, cfg: Cfg) -> Result<()> {
    // Delegate to a pure helper for easy unit testing without Anchor runtime
    assign_cfg_fields(&mut ctx.accounts.cfg, &cfg);
    Ok(())
}

/// Pure helper that applies the provided configuration onto the target state.
/// This is kept separate so we can unit test it with plain Rust types.
pub fn assign_cfg_fields(target: &mut Cfg, source: &Cfg) {
    target.guardian = source.guardian;
    target.eip1559 = source.eip1559.clone();
    target.gas_config = source.gas_config.clone();
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::internal::{Eip1559, Eip1559Config, GasConfig};
    use anchor_lang::prelude::Pubkey;

    fn sample_eip1559_config(minimum_base_fee: u64) -> Eip1559 {
        Eip1559 {
            config: Eip1559Config {
                target: 1_000_000,
                denominator: 10,
                window_duration_seconds: 60,
                minimum_base_fee,
            },
            current_base_fee: minimum_base_fee,
            current_window_gas_used: 0,
            window_start_time: 0,
        }
    }

    fn sample_gas_config(receiver: Pubkey) -> GasConfig {
        GasConfig {
            max_gas_limit_per_message: 10_000_000,
            gas_cost_scaler: 1,
            gas_cost_scaler_dp: 1,
            gas_fee_receiver: receiver,
        }
    }

    fn empty_cfg() -> Cfg {
        Cfg {
            guardian: Pubkey::default(),
            eip1559: sample_eip1559_config(0),
            gas_config: sample_gas_config(Pubkey::default()),
        }
    }

    #[test]
    fn assigns_guardian_from_source() {
        let mut target = empty_cfg();
        let new_guardian = Pubkey::new_unique();
        let source = Cfg {
            guardian: new_guardian,
            eip1559: sample_eip1559_config(100),
            gas_config: sample_gas_config(Pubkey::new_unique()),
        };

        assign_cfg_fields(&mut target, &source);

        assert_eq!(target.guardian, new_guardian);
    }

    #[test]
    fn assigns_eip1559_from_source() {
        let mut target = empty_cfg();
        let new_eip = sample_eip1559_config(123);
        let source = Cfg {
            guardian: Pubkey::new_unique(),
            eip1559: new_eip.clone(),
            gas_config: sample_gas_config(Pubkey::new_unique()),
        };

        assign_cfg_fields(&mut target, &source);

        assert_eq!(target.eip1559, new_eip);
    }

    #[test]
    fn assigns_gas_config_from_source() {
        let mut target = empty_cfg();
        let new_receiver = Pubkey::new_unique();
        let new_gas = sample_gas_config(new_receiver);
        let source = Cfg {
            guardian: Pubkey::new_unique(),
            eip1559: sample_eip1559_config(42),
            gas_config: new_gas.clone(),
        };

        assign_cfg_fields(&mut target, &source);

        assert_eq!(target.gas_config, new_gas);
    }
}
