use anchor_lang::prelude::*;

#[constant]
pub const INCOMING_MESSAGE_SEED: &[u8] = b"incoming_message";
#[constant]
pub const OUTPUT_ROOT_SEED: &[u8] = b"output_root";
#[constant]
pub const BRIDGE_CPI_AUTHORITY_SEED: &[u8] = b"bridge_cpi_authority";

mod private {
    use super::*;

    #[cfg(all(feature = "devnet", feature = "alpha"))]
    pub mod config {
        use super::*;

        #[constant]
        pub const TRUSTED_ORACLE: Pubkey = pubkey!("eEwCrQLBdQchykrkYitkYUZskd7MPrU2YxBXcPDPnMt");
        

        // TODO: Update the address later when we have a trusted validator
        #[constant]
        pub const TRUSTED_VALIDATOR: Pubkey = Pubkey::default();
    }

    #[cfg(all(feature = "devnet", feature = "prod"))]
    pub mod config {
        use super::*;

        #[constant]
        pub const TRUSTED_ORACLE: Pubkey = pubkey!("4vTj5kmBrmds3zWogiyUxtZPggcVUmG44EXRy2CxTcEZ");
        
        // TODO: Update the address later when we have a trusted validator
        #[constant]
        pub const TRUSTED_VALIDATOR: Pubkey = Pubkey::default();
    }

    #[cfg(not(any(feature = "devnet")))]
    pub mod config {
        use super::*;

        #[constant]
        // This is for registering output roots test
        // pub const TRUSTED_ORACLE: Pubkey = pubkey!("6FfuqkJTptvr6dCZnyp3tq3M4HkvyTE5DHyvqC537Lqt");
        pub const TRUSTED_ORACLE: Pubkey = pubkey!("CB8GXDdZDSD5uqfeow1qfp48ouayxXGpw7ycmoovuQMX");
        
        #[constant]
        pub const TRUSTED_VALIDATOR: Pubkey = pubkey!("9n3vTKJ49M4Xk3MhiCZY4LxXAdeEaDMVMuGxDwt54Hgx");
    }
}

pub use private::config::*;
