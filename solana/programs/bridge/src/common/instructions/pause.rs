use anchor_lang::prelude::*;

use crate::common::{
    bridge::{Bridge, BridgeError},
    BRIDGE_SEED,
};

#[derive(Accounts)]
pub struct AddGuardian<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(address = bridge.owner @ BridgeError::Unauthorized)]
    pub owner: Signer<'info>,

    #[account(mut, seeds = [BRIDGE_SEED], bump)]
    pub bridge: Account<'info, Bridge>,
}

pub fn add_guardian_handler(ctx: Context<AddGuardian>, guardian: Pubkey) -> Result<()> {
    ctx.accounts.bridge.add_guardian(guardian)?;
    
    emit!(GuardianAdded {
        guardian,
        owner: ctx.accounts.owner.key(),
    });
    
    Ok(())
}

#[derive(Accounts)]
pub struct RemoveGuardian<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(address = bridge.owner @ BridgeError::Unauthorized)]
    pub owner: Signer<'info>,

    #[account(mut, seeds = [BRIDGE_SEED], bump)]
    pub bridge: Account<'info, Bridge>,
}

pub fn remove_guardian_handler(ctx: Context<RemoveGuardian>, guardian: Pubkey) -> Result<()> {
    ctx.accounts.bridge.remove_guardian(&guardian)?;
    
    emit!(GuardianRemoved {
        guardian,
        owner: ctx.accounts.owner.key(),
    });
    
    Ok(())
}

#[derive(Accounts)]
pub struct PauseSwitch<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    pub guardian: Signer<'info>,

    #[account(mut, seeds = [BRIDGE_SEED], bump)]
    pub bridge: Account<'info, Bridge>,
}

pub fn pause_switch_handler(ctx: Context<PauseSwitch>) -> Result<()> {
    require!(
        ctx.accounts.bridge.is_guardian(&ctx.accounts.guardian.key()),
        BridgeError::Unauthorized
    );
    
    ctx.accounts.bridge.paused = !ctx.accounts.bridge.paused;
    
    emit!(PauseToggled {
        paused: ctx.accounts.bridge.paused,
        guardian: ctx.accounts.guardian.key(),
    });
    
    Ok(())
}

#[derive(Accounts)]
pub struct TransferOwnership<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(address = bridge.owner @ BridgeError::Unauthorized)]
    pub current_owner: Signer<'info>,

    #[account(mut, seeds = [BRIDGE_SEED], bump)]
    pub bridge: Account<'info, Bridge>,
}

pub fn transfer_ownership_handler(ctx: Context<TransferOwnership>, new_owner: Pubkey) -> Result<()> {
    let old_owner = ctx.accounts.bridge.owner;
    ctx.accounts.bridge.owner = new_owner;
    
    emit!(OwnershipTransferred {
        old_owner,
        new_owner,
    });
    
    Ok(())
}

#[event]
pub struct GuardianAdded {
    pub guardian: Pubkey,
    pub owner: Pubkey,
}

#[event]
pub struct GuardianRemoved {
    pub guardian: Pubkey,
    pub owner: Pubkey,
}

#[event]
pub struct PauseToggled {
    pub paused: bool,
    pub guardian: Pubkey,
}

#[event]
pub struct OwnershipTransferred {
    pub old_owner: Pubkey,
    pub new_owner: Pubkey,
}

#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::{
        solana_program::{
            example_mocks::solana_sdk::system_program, instruction::Instruction,
            native_token::LAMPORTS_PER_SOL,
        },
        InstructionData,
    };
    use litesvm::LiteSVM;
    use solana_keypair::Keypair;
    use solana_message::Message;
    use solana_signer::Signer;
    use solana_transaction::Transaction;

    use crate::{
        accounts,
        instruction,
        test_utils::mock_clock,
        ID,
    };

    fn setup_bridge_with_owner(svm: &mut LiteSVM, owner: &Keypair) -> Pubkey {
        let payer = Keypair::new();
        let payer_pk = payer.pubkey();
        svm.airdrop(&payer_pk, LAMPORTS_PER_SOL).unwrap();
        svm.airdrop(&owner.pubkey(), LAMPORTS_PER_SOL).unwrap();

        let timestamp = 1747440000;
        mock_clock(svm, timestamp);

        let bridge_pda = Pubkey::find_program_address(&[BRIDGE_SEED], &ID).0;

        let accounts = accounts::Initialize {
            payer: payer_pk,
            owner: owner.pubkey(),
            bridge: bridge_pda,
            system_program: system_program::ID,
        }
        .to_account_metas(None);

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: instruction::Initialize {}.data(),
        };

        let tx = Transaction::new(
            &[&payer, owner],
            Message::new(&[ix], Some(&payer_pk)),
            svm.latest_blockhash(),
        );

        svm.send_transaction(tx).unwrap();
        bridge_pda
    }

    #[test]
    fn test_add_guardian_success() {
        let mut svm = LiteSVM::new();
        svm.add_program_from_file(ID, "../../target/deploy/bridge.so")
            .unwrap();

        let owner = Keypair::new();
        let guardian = Keypair::new();
        let bridge_pda = setup_bridge_with_owner(&mut svm, &owner);

        // Add guardian
        let accounts = accounts::AddGuardian {
            payer: owner.pubkey(),
            owner: owner.pubkey(),
            bridge: bridge_pda,
        }
        .to_account_metas(None);

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: instruction::AddGuardian {
                guardian: guardian.pubkey(),
            }
            .data(),
        };

        let tx = Transaction::new(
            &[&owner],
            Message::new(&[ix], Some(&owner.pubkey())),
            svm.latest_blockhash(),
        );

        svm.send_transaction(tx).unwrap();

        // Verify guardian was added
        let bridge = svm.get_account(&bridge_pda).unwrap();
        let bridge = Bridge::try_deserialize(&mut &bridge.data[..]).unwrap();
        assert!(bridge.is_guardian(&guardian.pubkey()));
    }

    #[test]
    fn test_add_guardian_unauthorized() {
        let mut svm = LiteSVM::new();
        svm.add_program_from_file(ID, "../../target/deploy/bridge.so")
            .unwrap();

        let owner = Keypair::new();
        let unauthorized = Keypair::new();
        let guardian = Keypair::new();
        let bridge_pda = setup_bridge_with_owner(&mut svm, &owner);

        svm.airdrop(&unauthorized.pubkey(), LAMPORTS_PER_SOL).unwrap();

        // Try to add guardian with unauthorized account
        let accounts = accounts::AddGuardian {
            payer: unauthorized.pubkey(),
            owner: unauthorized.pubkey(),
            bridge: bridge_pda,
        }
        .to_account_metas(None);

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: instruction::AddGuardian {
                guardian: guardian.pubkey(),
            }
            .data(),
        };

        let tx = Transaction::new(
            &[&unauthorized],
            Message::new(&[ix], Some(&unauthorized.pubkey())),
            svm.latest_blockhash(),
        );

        // Should fail with unauthorized error
        assert!(svm.send_transaction(tx).is_err());
    }

    #[test]
    fn test_pause_switch_success() {
        let mut svm = LiteSVM::new();
        svm.add_program_from_file(ID, "../../target/deploy/bridge.so")
            .unwrap();

        let owner = Keypair::new();
        let guardian = Keypair::new();
        let bridge_pda = setup_bridge_with_owner(&mut svm, &owner);

        // Add guardian first
        let accounts = accounts::AddGuardian {
            payer: owner.pubkey(),
            owner: owner.pubkey(),
            bridge: bridge_pda,
        }
        .to_account_metas(None);

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: instruction::AddGuardian {
                guardian: guardian.pubkey(),
            }
            .data(),
        };

        let tx = Transaction::new(
            &[&owner],
            Message::new(&[ix], Some(&owner.pubkey())),
            svm.latest_blockhash(),
        );

        svm.send_transaction(tx).unwrap();

        // Airdrop to guardian
        svm.airdrop(&guardian.pubkey(), LAMPORTS_PER_SOL).unwrap();

        // Guardian pauses bridge
        let accounts = accounts::PauseSwitch {
            payer: guardian.pubkey(),
            guardian: guardian.pubkey(),
            bridge: bridge_pda,
        }
        .to_account_metas(None);

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: instruction::PauseSwitch {}.data(),
        };

        let tx = Transaction::new(
            &[&guardian],
            Message::new(&[ix], Some(&guardian.pubkey())),
            svm.latest_blockhash(),
        );

        svm.send_transaction(tx).unwrap();

        // Verify bridge is paused
        let bridge = svm.get_account(&bridge_pda).unwrap();
        let bridge = Bridge::try_deserialize(&mut &bridge.data[..]).unwrap();
        assert!(bridge.paused);

        // Advance blockhash to ensure different transaction signature
        svm.expire_blockhash();

        // Guardian unpauses bridge
        let accounts2 = accounts::PauseSwitch {
            payer: guardian.pubkey(),
            guardian: guardian.pubkey(),
            bridge: bridge_pda,
        }
        .to_account_metas(None);

        let ix2 = Instruction {
            program_id: ID,
            accounts: accounts2,
            data: instruction::PauseSwitch {}.data(),
        };

        let tx = Transaction::new(
            &[&guardian],
            Message::new(&[ix2], Some(&guardian.pubkey())),
            svm.latest_blockhash(),
        );

        svm.send_transaction(tx).unwrap();

        // Verify bridge is unpaused
        let bridge = svm.get_account(&bridge_pda).unwrap();
        let bridge = Bridge::try_deserialize(&mut &bridge.data[..]).unwrap();
        assert!(!bridge.paused);
    }

    #[test]
    fn test_pause_switch_unauthorized() {
        let mut svm = LiteSVM::new();
        svm.add_program_from_file(ID, "../../target/deploy/bridge.so")
            .unwrap();

        let owner = Keypair::new();
        let unauthorized = Keypair::new();
        let bridge_pda = setup_bridge_with_owner(&mut svm, &owner);

        svm.airdrop(&unauthorized.pubkey(), LAMPORTS_PER_SOL).unwrap();

        // Try to pause with unauthorized account
        let accounts = accounts::PauseSwitch {
            payer: unauthorized.pubkey(),
            guardian: unauthorized.pubkey(),
            bridge: bridge_pda,
        }
        .to_account_metas(None);

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: instruction::PauseSwitch {}.data(),
        };

        let tx = Transaction::new(
            &[&unauthorized],
            Message::new(&[ix], Some(&unauthorized.pubkey())),
            svm.latest_blockhash(),
        );

        // Should fail with unauthorized error
        assert!(svm.send_transaction(tx).is_err());
    }

    #[test]
    fn test_remove_guardian_success() {
        let mut svm = LiteSVM::new();
        svm.add_program_from_file(ID, "../../target/deploy/bridge.so")
            .unwrap();

        let owner = Keypair::new();
        let guardian = Keypair::new();
        let bridge_pda = setup_bridge_with_owner(&mut svm, &owner);

        // Add guardian first
        let accounts = accounts::AddGuardian {
            payer: owner.pubkey(),
            owner: owner.pubkey(),
            bridge: bridge_pda,
        }
        .to_account_metas(None);

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: instruction::AddGuardian {
                guardian: guardian.pubkey(),
            }
            .data(),
        };

        let tx = Transaction::new(
            &[&owner],
            Message::new(&[ix], Some(&owner.pubkey())),
            svm.latest_blockhash(),
        );

        svm.send_transaction(tx).unwrap();

        // Remove guardian
        let accounts = accounts::RemoveGuardian {
            payer: owner.pubkey(),
            owner: owner.pubkey(),
            bridge: bridge_pda,
        }
        .to_account_metas(None);

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: instruction::RemoveGuardian {
                guardian: guardian.pubkey(),
            }
            .data(),
        };

        let tx = Transaction::new(
            &[&owner],
            Message::new(&[ix], Some(&owner.pubkey())),
            svm.latest_blockhash(),
        );

        svm.send_transaction(tx).unwrap();

        // Verify guardian was removed
        let bridge = svm.get_account(&bridge_pda).unwrap();
        let bridge = Bridge::try_deserialize(&mut &bridge.data[..]).unwrap();
        assert!(!bridge.is_guardian(&guardian.pubkey()));
    }

    #[test]
    fn test_transfer_ownership_success() {
        let mut svm = LiteSVM::new();
        svm.add_program_from_file(ID, "../../target/deploy/bridge.so")
            .unwrap();

        let owner = Keypair::new();
        let new_owner = Keypair::new();
        let bridge_pda = setup_bridge_with_owner(&mut svm, &owner);

        // Transfer ownership
        let accounts = accounts::TransferOwnership {
            payer: owner.pubkey(),
            current_owner: owner.pubkey(),
            bridge: bridge_pda,
        }
        .to_account_metas(None);

        let ix = Instruction {
            program_id: ID,
            accounts,
            data: instruction::TransferOwnership {
                new_owner: new_owner.pubkey(),
            }
            .data(),
        };

        let tx = Transaction::new(
            &[&owner],
            Message::new(&[ix], Some(&owner.pubkey())),
            svm.latest_blockhash(),
        );

        svm.send_transaction(tx).unwrap();

        // Verify ownership was transferred
        let bridge = svm.get_account(&bridge_pda).unwrap();
        let bridge = Bridge::try_deserialize(&mut &bridge.data[..]).unwrap();
        assert_eq!(bridge.owner, new_owner.pubkey());
    }
} 