/**
 * solana/setupMints.js — Buddy: Lock In
 *
 * One-time setup script. Run this once on Solana devnet to create the
 * BUDDY_WIN and BUDDY_XP SPL token mints, then paste the logged addresses
 * into your .env file.
 *
 * Usage:
 *   node src/solana/setupMints.js
 *
 * Add to .env after running:
 *   BUDDY_WIN_MINT=<logged address>
 *   BUDDY_XP_MINT=<logged address>
 *
 * If your server wallet is low on devnet SOL, airdrop first:
 *   solana airdrop 2 <SERVER_WALLET_ADDRESS> --url devnet
 */

import dotenv from 'dotenv';
dotenv.config();

import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createMint } from '@solana/spl-token';

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

async function main() {
  const connection = new Connection(RPC_URL, 'confirmed');

  // ── Load server keypair (acts as mint authority) ──────────────────────────
  const raw = process.env.SERVER_WALLET_KEYPAIR;
  if (!raw) {
    console.error('❌ SERVER_WALLET_KEYPAIR not set in .env');
    process.exit(1);
  }

  let mintAuthority;
  try {
    mintAuthority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  } catch (err) {
    console.error('❌ Failed to parse SERVER_WALLET_KEYPAIR:', err.message);
    process.exit(1);
  }

  console.log('Mint authority:', mintAuthority.publicKey.toBase58());

  // ── Check balance (mint creation costs rent) ──────────────────────────────
  const balance = await connection.getBalance(mintAuthority.publicKey);
  console.log(`Balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

  if (balance < 0.05 * LAMPORTS_PER_SOL) {
    console.warn('⚠️  Low balance — airdrop devnet SOL first:');
    console.warn(`  solana airdrop 2 ${mintAuthority.publicKey.toBase58()} --url devnet`);
    console.warn('  (or visit https://faucet.solana.com)');
    process.exit(1);
  }

  // ── Create BUDDY_WIN mint ─────────────────────────────────────────────────
  // decimals: 0 — each token represents exactly one career win
  console.log('\nCreating BUDDY_WIN mint (decimals: 0)...');
  let winMint;
  try {
    winMint = await createMint(
      connection,
      mintAuthority,                // payer
      mintAuthority.publicKey,      // mint authority
      null,                         // freeze authority — none needed
      0,                            // decimals
    );
    console.log('✅ BUDDY_WIN mint created:', winMint.toBase58());
  } catch (err) {
    console.error('❌ BUDDY_WIN mint creation failed:', err.message);
    process.exit(1);
  }

  // ── Create BUDDY_XP mint ──────────────────────────────────────────────────
  // decimals: 0 — each token represents 1% of focus score per session
  console.log('\nCreating BUDDY_XP mint (decimals: 0)...');
  let xpMint;
  try {
    xpMint = await createMint(
      connection,
      mintAuthority,
      mintAuthority.publicKey,
      null,
      0,
    );
    console.log('✅ BUDDY_XP mint created:', xpMint.toBase58());
  } catch (err) {
    console.error('❌ BUDDY_XP mint creation failed:', err.message);
    process.exit(1);
  }

  // ── Print .env entries ────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('✅ Setup complete! Add these to your server/.env file:');
  console.log('══════════════════════════════════════════════════════════');
  console.log(`BUDDY_WIN_MINT=${winMint.toBase58()}`);
  console.log(`BUDDY_XP_MINT=${xpMint.toBase58()}`);
  console.log('══════════════════════════════════════════════════════════\n');
  console.log('To verify on-chain:');
  console.log(`  https://explorer.solana.com/address/${winMint.toBase58()}?cluster=devnet`);
  console.log(`  https://explorer.solana.com/address/${xpMint.toBase58()}?cluster=devnet`);
}

main().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
