use anchor_lang::prelude::*;

use crate::common::{
    constants::{
        EIP1559_DEFAULT_ADJUSTMENT_DENOMINATOR, EIP1559_DEFAULT_GAS_TARGET_PER_WINDOW,
        EIP1559_DEFAULT_WINDOW_DURATION_SECONDS, EIP1559_MINIMUM_BASE_FEE,
    },
    internal::math::{fixed_pow, SCALE},
};

// Import constants for default values
use crate::solana_to_base::{
    GAS_COST_SCALER, GAS_COST_SCALER_DP, GAS_FEE_RECEIVER, MAX_CALL_BUFFER_SIZE,
    MAX_GAS_LIMIT_PER_MESSAGE, RELAY_MESSAGES_CALL_ABI_ENCODING_OVERHEAD,
    RELAY_MESSAGES_TRANSFER_ABI_ENCODING_OVERHEAD,
    RELAY_MESSAGES_TRANSFER_AND_CALL_ABI_ENCODING_OVERHEAD,
};

#[account]
#[derive(Debug, Default, PartialEq, Eq, InitSpace)]
pub struct Bridge {
    /// The Base block number associated with the latest registered output root.
    pub base_block_number: u64,
    /// The nonce of the last Solana-to-Base message that was relayed on Base.
    pub base_last_relayed_nonce: u64,
    /// Incremental nonce assigned to each message.
    pub nonce: u64,
    /// EIP-1559 state and configuration for dynamic pricing.
    pub eip1559: Eip1559,
    /// Guardian pubkey authorized to update configuration
    pub guardian: Pubkey,
    /// Gas cost configuration
    pub gas_cost_config: GasCostConfig,
    /// Gas configuration
    pub gas_config: GasConfig,
    /// Protocol validation configuration
    pub protocol_config: ProtocolConfig,
    /// Buffer and size limits configuration
    pub limits_config: LimitsConfig,
    /// ABI encoding overhead configuration
    pub abi_config: AbiConfig,
}

#[derive(Debug, Clone, PartialEq, Eq, InitSpace, AnchorSerialize, AnchorDeserialize)]
pub struct Eip1559 {
    /// Gas target per window (configurable)
    pub target: u64,
    /// Adjustment denominator (controls rate of change) (configurable)
    pub denominator: u64,
    /// Window duration in seconds (configurable)
    pub window_duration_seconds: u64,
    /// Minimum base fee floor (configurable)
    pub minimum_base_fee: u64,
    /// Current base fee in gwei (runtime state)
    pub current_base_fee: u64,
    /// Gas used in the current time window (runtime state)
    pub current_window_gas_used: u64,
    /// Unix timestamp when the current window started (runtime state)
    pub window_start_time: i64,
}

impl Default for Eip1559 {
    fn default() -> Self {
        Self::new(0)
    }
}

impl Eip1559 {
    /// Create a new Eip1559 with default configuration and current timestamp
    pub fn new(current_timestamp: i64) -> Self {
        Self {
            target: EIP1559_DEFAULT_GAS_TARGET_PER_WINDOW,
            denominator: EIP1559_DEFAULT_ADJUSTMENT_DENOMINATOR,
            window_duration_seconds: EIP1559_DEFAULT_WINDOW_DURATION_SECONDS,
            minimum_base_fee: EIP1559_MINIMUM_BASE_FEE,
            current_base_fee: EIP1559_MINIMUM_BASE_FEE,
            current_window_gas_used: 0,
            window_start_time: current_timestamp,
        }
    }

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
            let scaled_denominator = self.denominator as u128 * SCALE;

            // [(denom - 1) / denom]
            // Guaranteed to be < SCALE.
            // NOTE: scaled_denominator is in SCALE units while self.denominator is not
            //       so the returned ratio is also in SCALE units
            let ratio = (scaled_denominator - SCALE) / (self.denominator as u128);

            // [(denom - 1) / denom]^(n-1)
            // Guaranteed to be < SCALE because ratio < SCALE.
            let factor = fixed_pow(ratio, remaining_windows_count);

            // base_fee_0 * [(denom - 1) / denom]^n
            // NOTE: multiply first in u128 and divide to scale back and fit into u64 while
            //       preserving the best precision
            current_base_fee = ((current_base_fee as u128 * factor) / SCALE) as u64;
        }

        // Update state for new window
        self.current_base_fee = current_base_fee;
        self.current_window_gas_used = 0;
        self.window_start_time = current_timestamp;

        current_base_fee
    }

    /// Add gas usage to current window
    pub fn add_gas_usage(&mut self, gas_amount: u64) {
        self.current_window_gas_used += gas_amount;
    }

    /// Calculate the base fee for the next window based on current window gas usage
    fn calc_base_fee(&self, gas_used: u64) -> u64 {
        if gas_used == self.target {
            return self.current_base_fee;
        }

        if gas_used > self.target {
            // If the current window used more gas than target, the base fee should increase.
            // max(1, baseFee * gasUsedDelta / target / denominator)
            let gas_used_delta = gas_used - self.target;
            let base_fee_delta =
                (gas_used_delta * self.current_base_fee) / self.target / self.denominator;

            // Ensure minimum increase of 1
            let base_fee_delta = base_fee_delta.max(1);
            self.current_base_fee + base_fee_delta
        } else {
            // If the current window used less gas than target, the base fee should decrease.
            // max(0, baseFee - (baseFee * gasUsedDelta / target / denominator))
            let gas_used_delta = self.target - gas_used;
            let base_fee_delta =
                (gas_used_delta * self.current_base_fee) / self.target / self.denominator;

            // Ensure base fee doesn't go below the configurable minimum
            self.current_base_fee
                .checked_sub(base_fee_delta)
                .unwrap_or(self.minimum_base_fee)
        }
    }

    /// Check if the current window has expired based on current timestamp
    fn expired_windows_count(&self, current_timestamp: i64) -> u64 {
        (current_timestamp as u64 - self.window_start_time as u64) / self.window_duration_seconds
    }
}

#[derive(Debug, Clone, PartialEq, Eq, InitSpace, AnchorSerialize, AnchorDeserialize)]
pub struct GasCostConfig {
    /// Scaling factor for gas cost calculations
    pub gas_cost_scaler: u64,
    /// Decimal precision for gas cost calculations
    pub gas_cost_scaler_dp: u64,
    /// Account that receives gas fees
    pub gas_fee_receiver: Pubkey,
}

impl Default for GasCostConfig {
    fn default() -> Self {
        Self {
            gas_cost_scaler: GAS_COST_SCALER,
            gas_cost_scaler_dp: GAS_COST_SCALER_DP,
            gas_fee_receiver: GAS_FEE_RECEIVER,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, InitSpace, AnchorSerialize, AnchorDeserialize)]
pub struct GasConfig {
    /// Additional relay buffer
    pub extra: u64,
    /// Pre-execution gas buffer
    pub execution_prologue: u64,
    /// Main execution gas buffer
    pub execution: u64,
    /// Post-execution gas buffer
    pub execution_epilogue: u64,
    /// Base transaction cost (Ethereum standard)
    pub base_transaction_cost: u64,
    /// Maximum gas limit per cross-chain message
    pub max_gas_limit_per_message: u64,
}

impl Default for GasConfig {
    fn default() -> Self {
        Self {
            extra: 10_000,
            execution_prologue: 65_000,
            execution: 40_000,
            execution_epilogue: 25_000,
            base_transaction_cost: 21_000,
            max_gas_limit_per_message: MAX_GAS_LIMIT_PER_MESSAGE,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, InitSpace, AnchorSerialize, AnchorDeserialize)]
pub struct ProtocolConfig {
    /// Block interval requirement for output root registration
    pub block_interval_requirement: u64,
}

impl Default for ProtocolConfig {
    fn default() -> Self {
        Self {
            block_interval_requirement: 300,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, InitSpace, AnchorSerialize, AnchorDeserialize)]
pub struct LimitsConfig {
    /// Maximum call buffer size (64KB)
    pub max_call_buffer_size: u64,
    /// Account data length limit for various operations
    pub max_data_len: u64,
}

impl Default for LimitsConfig {
    fn default() -> Self {
        Self {
            max_call_buffer_size: MAX_CALL_BUFFER_SIZE as u64,
            max_data_len: 1024,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, InitSpace, AnchorSerialize, AnchorDeserialize)]
pub struct AbiConfig {
    /// Overhead for call messages
    pub relay_messages_call_overhead: u64,
    /// Overhead for transfer messages
    pub relay_messages_transfer_overhead: u64,
    /// Overhead for combined transfer and call messages
    pub relay_messages_transfer_and_call_overhead: u64,
}

impl Default for AbiConfig {
    fn default() -> Self {
        Self {
            relay_messages_call_overhead: RELAY_MESSAGES_CALL_ABI_ENCODING_OVERHEAD,
            relay_messages_transfer_overhead: RELAY_MESSAGES_TRANSFER_ABI_ENCODING_OVERHEAD,
            relay_messages_transfer_and_call_overhead:
                RELAY_MESSAGES_TRANSFER_AND_CALL_ABI_ENCODING_OVERHEAD,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_state_creation() {
        let timestamp = 1234567890;
        let state = Eip1559::new(timestamp);

        assert_eq!(state.target, EIP1559_DEFAULT_GAS_TARGET_PER_WINDOW);
        assert_eq!(state.denominator, EIP1559_DEFAULT_ADJUSTMENT_DENOMINATOR);
        assert_eq!(state.current_base_fee, EIP1559_MINIMUM_BASE_FEE);
        assert_eq!(state.current_window_gas_used, 0);
        assert_eq!(state.window_start_time, timestamp);
    }

    #[test]
    fn test_calc_base_fee_gas_equals_target() {
        let state = Eip1559::new(0);
        let gas_used = state.target; // Exactly at target

        let new_fee = state.calc_base_fee(gas_used);
        assert_eq!(new_fee, state.current_base_fee); // Should remain unchanged
    }

    #[test]
    fn test_calc_base_fee_gas_above_target() {
        let mut state = Eip1559::new(0);
        state.current_base_fee = 1000;
        let gas_used = 8_000_000; // 3M above target (5M)

        let new_fee = state.calc_base_fee(gas_used);

        // Expected: (3_000_000 * 1000) / 5_000_000 / 2 = 3_000_000_000 / 5_000_000 / 2 = 600 / 2 = 300
        let expected_adjustment = 300;
        assert_eq!(new_fee, 1000 + expected_adjustment);
    }

    #[test]
    fn test_calc_base_fee_gas_below_target() {
        let mut state = Eip1559::new(0);
        state.current_base_fee = 1000;
        let gas_used = 2_000_000; // 3M below target (5M)

        let new_fee = state.calc_base_fee(gas_used);

        // Expected: (-3_000_000 * 1000) / 5_000_000 / 2 = -3_000_000_000 / 5_000_000 / 2 = -600 / 2 = -300
        let expected_adjustment = 300; // This is the reduction amount
        assert_eq!(new_fee, 1000 - expected_adjustment);
    }

    #[test]
    fn test_calc_base_fee_small_changes_have_effect() {
        let mut state = Eip1559::new(0);
        state.current_base_fee = 10_000_000; // Large base fee to amplify small changes
        let gas_used = state.target + 1; // Just 1 gas above target

        let new_fee = state.calc_base_fee(gas_used);

        // Should increase by minimum of 1
        assert!(new_fee > state.current_base_fee);
    }

    #[test]
    fn test_expired_windows_count() {
        let start_time = 1000;
        let state = Eip1559::new(start_time);

        // Window should not be expired at start time
        assert_eq!(state.expired_windows_count(start_time), 0);

        // Window should not be expired before duration
        let before_expiry = start_time + (state.window_duration_seconds as i64) - 1;
        assert_eq!(state.expired_windows_count(before_expiry), 0);

        // Window should be expired after duration
        let after_expiry = start_time + (state.window_duration_seconds as i64);
        assert_eq!(state.expired_windows_count(after_expiry), 1);

        // Window should be expired after 2 durations
        let after_two_expiry = start_time + (2 * state.window_duration_seconds as i64);
        assert_eq!(state.expired_windows_count(after_two_expiry), 2);
    }

    #[test]
    fn test_add_gas_usage() {
        let mut state = Eip1559::new(0);
        assert_eq!(state.current_window_gas_used, 0);

        state.add_gas_usage(1000);
        assert_eq!(state.current_window_gas_used, 1000);

        state.add_gas_usage(500);
        assert_eq!(state.current_window_gas_used, 1500);
    }

    #[test]
    fn test_refresh_base_fee_no_expiry() {
        let mut state = Eip1559::new(1000);
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
        let mut state = Eip1559::new(1000);
        state.current_base_fee = 1000;
        state.add_gas_usage(8_000_000); // Above target, should increase fee

        // Update with expired window
        let new_time = 1000 + state.window_duration_seconds as i64;
        state.refresh_base_fee(new_time);

        // Base fee should increase, gas usage should reset, window should restart
        assert!(state.current_base_fee > 1000);
        assert_eq!(state.current_window_gas_used, 0);
        assert_eq!(state.window_start_time, new_time);
    }

    #[test]
    fn test_refresh_base_fee_multiple_empty_windows() {
        let mut state = Eip1559::new(1000);
        state.current_base_fee = 8000; // High base fee
        state.add_gas_usage(10_000_000); // High usage in first window

        // Jump 1 window into the future
        let new_time = 1000 + state.window_duration_seconds as i64;
        let base_fee_immediately_after_first_window = state.refresh_base_fee(new_time);

        // Jump 100 windows into the future
        let windows_passed = 100;
        let new_time = 1000 + (windows_passed * state.window_duration_seconds as i64);
        let base_fee_after_all_empty_windows = state.refresh_base_fee(new_time);

        // Base fee should decrease, gas usage should reset, window should restart
        assert!(base_fee_after_all_empty_windows < base_fee_immediately_after_first_window);
        assert_eq!(state.current_window_gas_used, 0);
        assert_eq!(state.window_start_time, new_time);
    }
}
