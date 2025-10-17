use anchor_lang::prelude::*;

use crate::common::{
    internal::math::{fixed_pow, SCALE},
    MAX_PARTNER_VALIDATOR_THRESHOLD, MAX_SIGNER_COUNT,
};
use crate::BridgeError;

#[account]
#[derive(Debug, PartialEq, Eq, InitSpace)]
pub struct Bridge {
    /// The Base block number associated with the latest registered output root.
    pub base_block_number: u64,
    /// Incremental nonce assigned to each outgoing message.
    pub nonce: u64,
    /// Guardian pubkey authorized to update bridge configuration parameters
    pub guardian: Pubkey,
    /// Whether the bridge is paused (emergency stop mechanism)
    pub paused: bool,
    /// EIP-1559 state and configuration for dynamic pricing.
    pub eip1559: Eip1559,
    /// Configuration parameters for outgoing message pricing
    pub gas_config: GasConfig,
    /// Configuration parameters for bridge protocol
    pub protocol_config: ProtocolConfig,
    /// Configuration parameters for pre-loading Solana --> Base messages in buffer accounts
    pub buffer_config: BufferConfig,
    /// Partner oracle configuration containing the required signature threshold
    pub partner_oracle_config: PartnerOracleConfig,
    /// Configuration parameters for Base oracle signers
    pub base_oracle_config: BaseOracleConfig,
}

#[derive(Debug, Clone, PartialEq, Eq, InitSpace, AnchorSerialize, AnchorDeserialize)]
pub struct Eip1559 {
    /// Configuration parameters for EIP-1559-inspired fee calculations
    pub config: Eip1559Config,
    /// Current base fee used in fee computation (runtime state).
    /// Unitless value combined with `gas_per_call` and gas cost scaler to produce lamports.
    pub current_base_fee: u64,
    /// Gas used in the current time window (runtime state)
    pub current_window_gas_used: u64,
    /// Unix timestamp when the current window started (runtime state)
    pub window_start_time: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, InitSpace, AnchorSerialize, AnchorDeserialize)]
pub struct Eip1559Config {
    /// Gas target per window
    pub target: u64,
    /// Adjustment denominator (controls rate of change)
    pub denominator: u64,
    /// Window duration in seconds
    pub window_duration_seconds: u64,
    /// Minimum base fee. Used to seed `current_base_fee` at initialization
    /// and as an underflow clamp during decreases; not enforced as a strict lower bound
    /// on every step.
    pub minimum_base_fee: u64,
}

impl Eip1559Config {
    pub fn validate(&self) -> Result<()> {
        require!(self.denominator > 0, BridgeError::InvalidDenominator);
        require!(
            self.window_duration_seconds > 0,
            BridgeError::InvalidWindowDurationSeconds
        );
        Ok(())
    }
}

impl Eip1559 {
    /// Refresh the base fee if window has expired, reset window tracking
    /// Handles multiple expired windows by processing each empty window
    pub fn refresh_base_fee(&mut self, current_timestamp: i64) -> u64 {
        let expired_windows_count = self.expired_windows_count(current_timestamp);
        if expired_windows_count == 0 {
            return self.current_base_fee;
        }

        // Process the first window with actual gas usage
        let mut current_base_fee = self.calc_base_fee(self.current_window_gas_used);
        let remaining_windows_count = expired_windows_count - 1;

        // Process the remaining empty windows (if any)
        //
        // This corresponds to applying this formula (because gas_used is 0):
        //      base_fee_n+1 = base_fee_n - (base_fee_n / denom)
        //                   = base_fee_n * (1 - 1 / denom)
        //                   = base_fee_n * (denom - 1) / denom
        // Thus:
        //      base_fee_n = base_fee_0 * [(denom - 1) / denom]^n
        if remaining_windows_count > 0 {
            // Scale up as we're going to do some arithmetic
            let scaled_denominator = self.config.denominator as u128 * SCALE;

            // [(denom - 1) / denom]
            // Guaranteed to be < SCALE.
            // NOTE: scaled_denominator is in SCALE units while self.denominator is not
            //       so the returned ratio is also in SCALE units
            let ratio = (scaled_denominator - SCALE) / (self.config.denominator as u128);

            // [(denom - 1) / denom]^(n-1)
            // Guaranteed to be < SCALE because ratio < SCALE.
            let factor = fixed_pow(ratio, remaining_windows_count);

            // base_fee_0 * [(denom - 1) / denom]^n
            // NOTE: multiply first in u128 and divide to scale back and fit into u64 while
            //       preserving the best precision
            current_base_fee = ((current_base_fee as u128 * factor) / SCALE) as u64;
        }

        // Update state for new window
        self.current_base_fee = current_base_fee.max(self.config.minimum_base_fee);
        self.current_window_gas_used = 0;
        self.window_start_time +=
            (expired_windows_count * self.config.window_duration_seconds) as i64;

        self.current_base_fee
    }

    /// Add gas usage to current window
    pub fn add_gas_usage(&mut self, gas_amount: u64) {
        self.current_window_gas_used += gas_amount;
    }

    /// Calculate the base fee for the next window based on current window gas usage
    fn calc_base_fee(&self, gas_used: u64) -> u64 {
        if gas_used == self.config.target {
            return self.current_base_fee;
        }

        if gas_used > self.config.target {
            // If the current window used more gas than target, the base fee should increase.
            // max(1, baseFee * gasUsedDelta / target / denominator)
            let gas_used_delta = gas_used - self.config.target;
            let base_fee_delta = (gas_used_delta * self.current_base_fee)
                / self.config.target
                / self.config.denominator;

            // Ensure minimum increase of 1
            let base_fee_delta = base_fee_delta.max(1);
            self.current_base_fee + base_fee_delta
        } else {
            // If the current window used less gas than target, the base fee should decrease
            // by (baseFee * gasUsedDelta / target / denominator).
            let gas_used_delta = self.config.target - gas_used;
            let base_fee_delta = (gas_used_delta * self.current_base_fee)
                / self.config.target
                / self.config.denominator;

            self.current_base_fee.saturating_sub(base_fee_delta)
        }
    }

    /// Check if the current window has expired based on current timestamp
    fn expired_windows_count(&self, current_timestamp: i64) -> u64 {
        (current_timestamp as u64 - self.window_start_time as u64)
            / self.config.window_duration_seconds
    }
}

#[derive(Debug, Clone, PartialEq, Eq, InitSpace, AnchorSerialize, AnchorDeserialize)]
pub struct GasConfig {
    /// Scaling factor applied when converting (gas_per_call * base_fee) into lamports
    pub gas_cost_scaler: u64,
    /// Decimal precision for the gas cost scaler (denominator)
    pub gas_cost_scaler_dp: u64,
    /// Account that receives gas fees collected on Solana
    pub gas_fee_receiver: Pubkey,
    /// Amount of gas per Solana --> Base message
    pub gas_per_call: u64,
}

impl GasConfig {
    pub fn validate(&self) -> Result<()> {
        require!(
            self.gas_cost_scaler_dp > 0,
            BridgeError::InvalidGasCostScalerDp
        );
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, InitSpace, AnchorSerialize, AnchorDeserialize)]
pub struct ProtocolConfig {
    /// Block interval requirement for output root registration. Every Base block associated with a
    /// submitted output root must be a multiple of this number.
    pub block_interval_requirement: u64,

    /// The Base evm address of SOL
    pub remote_sol_address: [u8; 20],
}

impl ProtocolConfig {
    pub fn validate(&self) -> Result<()> {
        require!(
            self.block_interval_requirement > 0,
            BridgeError::InvalidBlockIntervalRequirement
        );

        require!(
            self.block_interval_requirement <= 1000,
            BridgeError::InvalidBlockIntervalRequirement
        );

        require!(
            self.remote_sol_address != [0u8; 20],
            BridgeError::ZeroAddress
        );
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, InitSpace, AnchorSerialize, AnchorDeserialize)]
pub struct BufferConfig {
    /// Maximum call buffer size. This caps the max size of a Solana → Base message.
    pub max_call_buffer_size: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, InitSpace, AnchorSerialize, AnchorDeserialize, Default)]
pub struct PartnerOracleConfig {
    /// Partner signatures required by our bridge to accept an output root
    pub required_threshold: u8,
}

impl PartnerOracleConfig {
    pub fn validate(&self) -> Result<()> {
        require!(
            self.required_threshold <= MAX_PARTNER_VALIDATOR_THRESHOLD,
            BridgeError::InvalidPartnerThreshold
        );
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, InitSpace, AnchorSerialize, AnchorDeserialize)]
pub struct BaseOracleConfig {
    /// Number of required valid unique signatures
    pub threshold: u8,
    /// Number of signers in `signers` array
    pub signer_count: u8,
    /// Static list of authorized signer addresses
    pub signers: [[u8; 20]; MAX_SIGNER_COUNT as usize],
}

impl BaseOracleConfig {
    pub fn validate(&self) -> Result<()> {
        require!(
            self.threshold > 0 && self.threshold <= self.signer_count,
            BridgeError::InvalidThreshold
        );
        require!(
            self.signer_count as usize <= self.signers.len(),
            BridgeError::TooManySigners
        );

        // Ensure uniqueness among the provided signer_count entries
        {
            let provided_count = self.signer_count as usize;
            let mut addrs: Vec<[u8; 20]> = self.signers[..provided_count].to_vec();
            addrs.sort();
            addrs.dedup();
            require!(addrs.len() == provided_count, BridgeError::DuplicateSigner);
        }

        Ok(())
    }

    pub fn contains(&self, evm_addr: &[u8; 20]) -> bool {
        let active_len = core::cmp::min(self.signer_count as usize, self.signers.len());
        self.signers[..active_len].iter().any(|s| s == evm_addr)
    }

    pub fn count_approvals(&self, signers: &[[u8; 20]]) -> u32 {
        let mut count: u32 = 0;
        for signer in signers.iter() {
            if self.contains(signer) {
                count += 1;
            }
        }
        count
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_state_creation() {
        let timestamp = 1234567890;
        let state = Eip1559 {
            config: Eip1559Config::test_new(),
            current_base_fee: 1000,
            current_window_gas_used: 0,
            window_start_time: timestamp,
        };

        assert_eq!(state.config, Eip1559Config::test_new());
        assert_eq!(state.current_base_fee, 1000);
        assert_eq!(state.current_window_gas_used, 0);
        assert_eq!(state.window_start_time, timestamp);
    }

    #[test]
    fn test_calc_base_fee_gas_equals_target() {
        let state = Eip1559 {
            config: Eip1559Config::test_new(),
            current_base_fee: 1000,
            current_window_gas_used: 5_000_000,
            window_start_time: 0,
        };
        let gas_used = state.config.target; // Exactly at target

        let new_fee = state.calc_base_fee(gas_used);
        assert_eq!(new_fee, state.current_base_fee); // Should remain unchanged
    }

    #[test]
    fn test_calc_base_fee_gas_above_target() {
        let state = Eip1559 {
            config: Eip1559Config::test_new(),
            current_base_fee: 1000,
            current_window_gas_used: 0,
            window_start_time: 0,
        };
        let gas_used = state.config.target + 3_000_000; // 3M above target (5M)

        let new_fee = state.calc_base_fee(gas_used);

        // Expected: (3_000_000 * 1000) / 5_000_000 / 2 = 3_000_000_000 / 5_000_000 / 2 = 600 / 2 = 300
        let expected_adjustment = 300;
        assert_eq!(new_fee, 1000 + expected_adjustment);
    }

    #[test]
    fn test_calc_base_fee_gas_below_target() {
        let state = Eip1559 {
            config: Eip1559Config::test_new(),
            current_base_fee: 1000,
            current_window_gas_used: 0,
            window_start_time: 0,
        };
        let gas_used = state.config.target - 3_000_000; // 3M below target (5M)

        let new_fee = state.calc_base_fee(gas_used);

        // Expected: (-3_000_000 * 1000) / 5_000_000 / 2 = -3_000_000_000 / 5_000_000 / 2 = -600 / 2 = -300
        let expected_adjustment = 300; // This is the reduction amount
        assert_eq!(new_fee, 1000 - expected_adjustment);
    }

    #[test]
    fn test_calc_base_fee_small_changes_have_effect() {
        let state = Eip1559 {
            config: Eip1559Config::test_new(),
            current_base_fee: 10_000_000, // Large base fee to amplify small changes
            current_window_gas_used: 0,
            window_start_time: 0,
        };
        let gas_used = state.config.target + 1; // Just 1 gas above target

        let new_fee = state.calc_base_fee(gas_used);

        // Should increase by minimum of 1
        assert!(new_fee > state.current_base_fee);
    }

    #[test]
    fn test_expired_windows_count() {
        let start_time = 1000;
        let state = Eip1559 {
            config: Eip1559Config {
                target: 5_000_000,
                denominator: 2,
                window_duration_seconds: 1,
                minimum_base_fee: 1,
            },
            current_base_fee: 1000,
            current_window_gas_used: 0,
            window_start_time: start_time,
        };

        // Window should not be expired at start time
        assert_eq!(state.expired_windows_count(start_time), 0);

        // Window should not be expired before duration
        let before_expiry = start_time + (state.config.window_duration_seconds as i64) - 1;
        assert_eq!(state.expired_windows_count(before_expiry), 0);

        // Window should be expired after duration
        let after_expiry = start_time + (state.config.window_duration_seconds as i64);
        assert_eq!(state.expired_windows_count(after_expiry), 1);

        // Window should be expired after 2 durations
        let after_two_expiry = start_time + (2 * state.config.window_duration_seconds as i64);
        assert_eq!(state.expired_windows_count(after_two_expiry), 2);
    }

    #[test]
    fn test_add_gas_usage() {
        let mut state = Eip1559 {
            config: Eip1559Config::test_new(),
            current_base_fee: 1000,
            current_window_gas_used: 0,
            window_start_time: 0,
        };
        assert_eq!(state.current_window_gas_used, 0);

        state.add_gas_usage(1000);
        assert_eq!(state.current_window_gas_used, 1000);

        state.add_gas_usage(500);
        assert_eq!(state.current_window_gas_used, 1500);
    }

    #[test]
    fn test_refresh_base_fee_no_expiry() {
        let mut state = Eip1559 {
            config: Eip1559Config::test_new(),
            current_base_fee: 1000,
            current_window_gas_used: 0,
            window_start_time: 1000,
        };
        let original_base_fee = state.current_base_fee;
        state.add_gas_usage(2_000_000);

        // Update with current time (no expiry)
        state.refresh_base_fee(1000);

        // Base fee should not change, gas usage should remain
        assert_eq!(state.current_base_fee, original_base_fee);
        assert_eq!(state.current_window_gas_used, 2_000_000);
        assert_eq!(state.window_start_time, 1000);
    }

    #[test]
    fn test_refresh_base_fee_with_expiry() {
        let mut state = Eip1559 {
            config: Eip1559Config::test_new(),
            current_base_fee: 1000,
            current_window_gas_used: 0,
            window_start_time: 1000,
        };
        state.add_gas_usage(8_000_000); // Above target, should increase fee

        // Update with expired window
        let new_time = 1000 + state.config.window_duration_seconds as i64;
        state.refresh_base_fee(new_time);

        // Base fee should increase, gas usage should reset, window should restart
        assert!(state.current_base_fee > 1000);
        assert_eq!(state.current_window_gas_used, 0);
        assert_eq!(state.window_start_time, new_time);
    }

    #[test]
    fn test_refresh_base_fee_multiple_empty_windows() {
        let mut state = Eip1559 {
            config: Eip1559Config::test_new(),
            current_base_fee: 8000, // High base fee
            current_window_gas_used: 0,
            window_start_time: 1000,
        };
        state.add_gas_usage(10_000_000); // High usage in first window

        // Jump 1 window into the future
        let new_time = 1000 + state.config.window_duration_seconds as i64;
        let base_fee_immediately_after_first_window = state.refresh_base_fee(new_time);

        // Jump 100 windows into the future
        let windows_passed = 100;
        let new_time = 1000 + (windows_passed * state.config.window_duration_seconds as i64);
        let base_fee_after_all_empty_windows = state.refresh_base_fee(new_time);

        // Base fee should decrease, gas usage should reset, window should restart
        assert!(base_fee_after_all_empty_windows < base_fee_immediately_after_first_window);
        assert_eq!(state.current_window_gas_used, 0);
        assert_eq!(state.window_start_time, new_time);
    }
}
