/**
 * solana/test.js — manual test for payout + reputation minting
 *
 * Usage:
 *   node src/solana/test.js
 *
 * Tests (in order):
 *   1. getPlayerReputation  — reads on-chain token balances (should be 0 first run)
 *   2. mintSessionReputation — mints BUDDY_XP + BUDDY_WIN to mock players
 *   3. getPlayerReputation  — re-reads balances to confirm tokens were minted
 *   4. executeAtomicPayout  — splits a mock pot among mock players (needs SOL balance)
 */

import dotenv from 'dotenv';
dotenv.config();

import { Keypair, PublicKey } from '@solana/web3.js';
import { executeAtomicPayout } from './payout.js';
import { mintSessionReputation, getPlayerReputation } from './mintReputation.js';

// ── Load server keypair ───────────────────────────────────────────────────────
const serverKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(process.env.SERVER_WALLET_KEYPAIR))
);
console.log('Server wallet:', serverKeypair.publicKey.toBase58());

// ── Mock players — replace walletAddress with real devnet wallets you control ─
// You can use the server wallet itself as a "player" just to verify the flow.
const MOCK_PLAYERS = [
  {
    walletAddress:  serverKeypair.publicKey.toBase58(), // reuse server wallet for easy testing
    compositeScore: 0.87,
    focusScore:     0.91,
    rank:           1,
  },
  {
    walletAddress:  serverKeypair.publicKey.toBase58(), // same wallet, second "player"
    compositeScore: 0.74,
    focusScore:     0.78,
    rank:           2,
  },
];

const MOCK_STAKE_LAMPORTS = 10_000_000; // 0.01 SOL total pot (tiny — just for testing)

async function run() {
  console.log('\n══════════════════════════════════════════');
  console.log(' TEST 1: getPlayerReputation (before mint)');
  console.log('══════════════════════════════════════════');
  const repBefore = await getPlayerReputation(serverKeypair.publicKey.toBase58());
  console.log('Reputation before:', repBefore);

  console.log('\n══════════════════════════════════════════');
  console.log(' TEST 2: mintSessionReputation');
  console.log('══════════════════════════════════════════');
  const mintResult = await mintSessionReputation({
    players:              MOCK_PLAYERS,
    mintAuthorityKeypair: serverKeypair,
    winTokenMintAddress:  new PublicKey(process.env.BUDDY_WIN_MINT),
    xpTokenMintAddress:   new PublicKey(process.env.BUDDY_XP_MINT),
  });
  console.log('Mint result:', JSON.stringify(mintResult, null, 2));

  console.log('\n══════════════════════════════════════════');
  console.log(' TEST 3: getPlayerReputation (after mint)');
  console.log('══════════════════════════════════════════');
  const repAfter = await getPlayerReputation(serverKeypair.publicKey.toBase58());
  console.log('Reputation after:', repAfter);

  console.log('\n══════════════════════════════════════════');
  console.log(' TEST 4: executeAtomicPayout');
  console.log('══════════════════════════════════════════');
  const payoutResult = await executeAtomicPayout({
    players:             MOCK_PLAYERS,
    totalStakedLamports: MOCK_STAKE_LAMPORTS,
    serverEscrowKeypair: serverKeypair,
  });
  console.log('Payout result:', JSON.stringify(payoutResult, null, 2));

  console.log('\n✅ All tests complete.');
}

run().catch((err) => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
