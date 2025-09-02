use anchor_lang::prelude::*;

use crate::{constants::SCALE, internal::fixed_pow};

#[derive(Debug, Clone, PartialEq, Eq, InitSpace, AnchorSerialize, AnchorDeserialize)]
pub struct Eip1559 {
    pub config: Eip1559Config,
    /// Current base fee in gwei (runtime state)
    pub current_base_fee: u64,
    /// Gas used in the current time window (runtime state)
    pub current_window_gas_used: u64,
    /// Unix timestamp when the current window started (runtime state)
    pub window_start_time: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, InitSpace, AnchorSerialize, AnchorDeserialize)]
pub struct Eip1559Config {
    /// Gas target per window (configurable)
    pub target: u64,
    /// Adjustment denominator (controls rate of change) (configurable)
    pub denominator: u64,
    /// Window duration in seconds (configurable)
    pub window_duration_seconds: u64,
    /// Minimum base fee floor (configurable)
    pub minimum_base_fee: u64,
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
            // If the current window used less gas than target, the base fee should decrease.
            // max(0, baseFee - (baseFee * gasUsedDelta / target / denominator))
            let gas_used_delta = self.config.target - gas_used;
            let base_fee_delta = (gas_used_delta * self.current_base_fee)
                / self.config.target
                / self.config.denominator;

            // Ensure base fee doesn't go below the configurable minimum
            self.current_base_fee
                .checked_sub(base_fee_delta)
                .unwrap_or(self.config.minimum_base_fee)
        }
    }

    /// Check if the current window has expired based on current timestamp
    fn expired_windows_count(&self, current_timestamp: i64) -> u64 {
        (current_timestamp as u64 - self.window_start_time as u64)
            / self.config.window_duration_seconds
    }
}
