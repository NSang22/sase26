/**
 * solana/payout.js — Buddy: Lock In
 *
 * Executes a single atomic Solana transaction that splits the staked SOL pot
 * among up to 4 players based on their composite focus scores.
 *
 * Rank share weights — last place always gets 0, full pot goes to others:
 *   2 players: 1st=100%, 2nd=0%
 *   3 players: 1st=70%,  2nd=30%,  3rd=0%
 *   4 players: 1st=50%,  2nd=30%,  3rd=20%, 4th=0%
 *
 * Ties: tied players split the combined share of all positions they occupy.
 * No platform fee — 100% of the pot is returned to players.
 */

import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

// Explicit payout weights per player count. Last place always gets 0.
const WEIGHTS_BY_COUNT = {
  2: [1.00, 0.00],
  3: [0.70, 0.30, 0.00],
  4: [0.50, 0.30, 0.20, 0.00],
};

/**
 * Compute each player's fractional share of the pot.
 * Handles ties and variable player counts (2–4).
 *
 * @param {{ walletAddress: string, compositeScore: number }[]} players
 * @returns {{ walletAddress: string, compositeScore: number, share: number }[]}
 */
export function computeShares(players) {
  const n = Math.min(players.length, 4);

  // Sort descending by composite score
  const sorted = [...players]
    .slice(0, n)
    .sort((a, b) => b.compositeScore - a.compositeScore);

  // Look up exact weights for this player count (last place is always 0)
  const weights = WEIGHTS_BY_COUNT[n] ?? WEIGHTS_BY_COUNT[4];

  // Total weight (sums to 1.0 by design, but compute for safety)
  const totalWeight = weights.reduce((s, v) => s + v, 0);

  // Group players by tied score
  const groups = [];
  let i = 0;
  while (i < n) {
    const score = sorted[i].compositeScore;
    const group = [];
    while (i < n && sorted[i].compositeScore === score) {
      group.push(sorted[i]);
      i++;
    }
    groups.push(group);
  }

  // Assign shares — each tied group gets the sum of its occupied rank slots
  const shareMap = new Map();
  let rankOffset = 0;
  for (const group of groups) {
    let combinedWeight = 0;
    for (let j = 0; j < group.length; j++) {
      combinedWeight += weights[rankOffset + j] ?? 0;
    }
    // Normalize so shares sum to 1 across all present players
    const perPlayer = totalWeight > 0
      ? (combinedWeight / totalWeight) / group.length
      : 1 / n;
    for (const p of group) {
      shareMap.set(p.walletAddress, perPlayer);
    }
    rankOffset += group.length;
  }

  return sorted.map((p) => ({
    ...p,
    share: shareMap.get(p.walletAddress) ?? 0,
  }));
}

/**
 * Build and send a single atomic payout transaction.
 *
 * @param {{
 *   players:              { walletAddress: string, compositeScore: number }[],
 *   totalStakedLamports:  number,
 *   serverEscrowKeypair:  import('@solana/web3.js').Keypair,
 * }} sessionResult
 *
 * @returns {Promise<{
 *   success:    boolean,
 *   signature?: string,
 *   payouts?:   { walletAddress: string, lamports: number }[],
 *   error?:     string,
 * }>}
 */
export async function executeAtomicPayout(sessionResult) {
  const { players, totalStakedLamports, serverEscrowKeypair } = sessionResult;

  if (!players?.length)
    return { success: false, error: 'No players provided' };
  if (!totalStakedLamports || totalStakedLamports <= 0)
    return { success: false, error: 'Invalid stake amount' };
  if (!serverEscrowKeypair)
    return { success: false, error: 'No escrow keypair provided' };

  const connection = new Connection(RPC_URL, 'confirmed');

  // ── Step 1: Verify server wallet has enough SOL ───────────────────────────
  let balance;
  try {
    balance = await connection.getBalance(serverEscrowKeypair.publicKey);
    console.log(
      `[payout] Server wallet balance: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`
    );
  } catch (err) {
    return { success: false, error: `Balance check failed: ${err.message}` };
  }

  if (balance < totalStakedLamports) {
    return {
      success: false,
      error: `Insufficient balance: have ${balance} lamports, need ${totalStakedLamports}`,
    };
  }

  // ── Step 2: Compute per-player lamport amounts ────────────────────────────
  // Full pot goes to players — no platform fee
  const netPot  = totalStakedLamports;
  const ranked  = computeShares(players);
  const payouts = ranked
    .map((p) => ({
      walletAddress: p.walletAddress,
      lamports:      Math.floor(netPot * p.share),
    }))
    .filter((p) => p.lamports > 0); // skip 0-lamport slots (e.g. 4th place)

  console.log('[payout] Computed payouts:');
  ranked.forEach((p) =>
    console.log(
      `  ${p.walletAddress}: ${Math.floor(netPot * p.share)} lamports` +
      ` (${(p.share * 100).toFixed(1)}% of net pot)`
    )
  );

  if (!payouts.length)
    return { success: false, error: 'All computed shares are zero' };

  // ── Step 3: Build single atomic transaction ───────────────────────────────
  // All transfers are batched into one tx — either all succeed or none do.
  const tx = new Transaction();

  for (const { walletAddress, lamports } of payouts) {
    let toPubkey;
    try {
      toPubkey = new PublicKey(walletAddress);
    } catch {
      console.warn(`[payout] Skipping invalid wallet address: ${walletAddress}`);
      continue;
    }
    tx.add(
      SystemProgram.transfer({
        fromPubkey: serverEscrowKeypair.publicKey,
        toPubkey,
        lamports,
      })
    );
    console.log(`[payout] Queued transfer: ${lamports} lamports → ${walletAddress}`);
  }

  if (!tx.instructions.length)
    return { success: false, error: 'No valid transfer instructions' };

  // ── Step 4: Send and confirm ──────────────────────────────────────────────
  let signature;
  try {
    console.log(
      `[payout] Sending atomic transaction ` +
      `(${tx.instructions.length} transfer(s), net pot: ${netPot} lamports)...`
    );
    signature = await sendAndConfirmTransaction(
      connection,
      tx,
      [serverEscrowKeypair],
      { commitment: 'confirmed' }
    );
    console.log(`[payout] ✅ Confirmed — signature: ${signature}`);
  } catch (err) {
    console.error('[payout] ❌ Transaction failed:', err.message);
    return { success: false, error: `Transaction failed: ${err.message}` };
  }

  return {
    success: true,
    signature,
    payouts: payouts.map(({ walletAddress, lamports }) => ({ walletAddress, lamports })),
  };
}
