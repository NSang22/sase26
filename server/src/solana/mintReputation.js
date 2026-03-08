/**
 * solana/mintReputation.js — Buddy: Lock In
 *
 * On-chain study reputation encoded as SPL tokens.
 * Two token types make a player's track record verifiable before betting:
 *
 *   BUDDY_WIN — minted to 1st place only. Balance = career win count.
 *   BUDDY_XP  — minted to all players. Amount = Math.floor(focusScore * 100).
 *                A 0.87 focus score earns 87 XP tokens.
 *                Minimum 1 token regardless of score.
 *
 * Run solana/setupMints.js once to create the mints, then add to .env:
 *   BUDDY_WIN_MINT=<address>
 *   BUDDY_XP_MINT=<address>
 */

import { Connection, PublicKey } from '@solana/web3.js';
import {
  getOrCreateAssociatedTokenAccount,
  getAssociatedTokenAddress,
  getAccount,
  mintTo,
} from '@solana/spl-token';

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

function getConnection() {
  return new Connection(RPC_URL, 'confirmed');
}

/**
 * Mint BUDDY_WIN and BUDDY_XP tokens to all players after a session ends.
 * Errors for individual players are caught and logged — other players still receive their tokens.
 *
 * @param {{
 *   players: {
 *     walletAddress: string,
 *     focusScore:    number,   // 0–1, e.g. 0.87
 *     rank:          number,   // 1 = first place
 *   }[],
 *   mintAuthorityKeypair: import('@solana/web3.js').Keypair,
 *   winTokenMintAddress:  PublicKey,
 *   xpTokenMintAddress:   PublicKey,
 * }} input
 *
 * @returns {Promise<{
 *   success: boolean,
 *   mintResults: {
 *     walletAddress: string,
 *     xpMinted:  number,
 *     winMinted: number,
 *     signatures: string[],
 *     error?: string,
 *   }[],
 * }>}
 */
export async function mintSessionReputation(input) {
  const { players, mintAuthorityKeypair, winTokenMintAddress, xpTokenMintAddress } = input;
  const connection  = getConnection();
  const mintResults = [];

  for (const player of players) {
    const result = {
      walletAddress: player.walletAddress,
      xpMinted:      0,
      winMinted:     0,
      signatures:    [],
    };

    // Validate wallet address before attempting any mints
    let playerPubkey;
    try {
      playerPubkey = new PublicKey(player.walletAddress);
    } catch {
      console.warn(`[reputation] Invalid wallet address — skipping: ${player.walletAddress}`);
      mintResults.push({ ...result, error: 'Invalid wallet address' });
      continue;
    }

    // ── BUDDY_XP — minted to every player proportional to focus ─────────────
    // Min 1 token so even low-focus players are recorded on-chain
    const xpAmount = Math.max(1, Math.floor(player.focusScore * 100));
    try {
      console.log(
        `[reputation] Minting ${xpAmount} BUDDY_XP → ${player.walletAddress}` +
        ` (focus score: ${player.focusScore.toFixed(2)})`
      );
      // getOrCreateAssociatedTokenAccount creates the ATA if this is a first-time player
      const xpAta = await getOrCreateAssociatedTokenAccount(
        connection,
        mintAuthorityKeypair,    // payer for ATA rent
        xpTokenMintAddress,
        playerPubkey,
      );
      const xpSig = await mintTo(
        connection,
        mintAuthorityKeypair,    // payer
        xpTokenMintAddress,
        xpAta.address,           // destination ATA
        mintAuthorityKeypair,    // mint authority
        xpAmount,
      );
      result.xpMinted = xpAmount;
      result.signatures.push(xpSig);
      console.log(`[reputation] ✅ BUDDY_XP minted — tx: ${xpSig}`);
    } catch (err) {
      // Log but don't abort — continue to next player
      console.error(
        `[reputation] ❌ BUDDY_XP mint failed for ${player.walletAddress}:`,
        err.message
      );
    }

    // ── BUDDY_WIN — minted to 1st place only (= career win badge) ───────────
    if (player.rank === 1) {
      try {
        console.log(`[reputation] Minting 1 BUDDY_WIN → ${player.walletAddress} (rank 1)`);
        const winAta = await getOrCreateAssociatedTokenAccount(
          connection,
          mintAuthorityKeypair,
          winTokenMintAddress,
          playerPubkey,
        );
        const winSig = await mintTo(
          connection,
          mintAuthorityKeypair,
          winTokenMintAddress,
          winAta.address,
          mintAuthorityKeypair,
          1,                     // exactly 1 win token per session win
        );
        result.winMinted = 1;
        result.signatures.push(winSig);
        console.log(`[reputation] ✅ BUDDY_WIN minted — tx: ${winSig}`);
      } catch (err) {
        console.error(
          `[reputation] ❌ BUDDY_WIN mint failed for ${player.walletAddress}:`,
          err.message
        );
      }
    }

    mintResults.push(result);
  }

  const success = mintResults.some((r) => r.xpMinted > 0 || r.winMinted > 0);
  return { success, mintResults };
}

/**
 * Fetch a player's on-chain study reputation from their SPL token balances.
 * Called in the waiting room so players can verify each other's track records before betting.
 *
 * @param {string} walletAddress
 * @returns {Promise<{
 *   walletAddress:    string,
 *   wins:             number,   // BUDDY_WIN balance = career wins
 *   totalXP:          number,   // BUDDY_XP balance = lifetime XP tokens
 *   reputationScore:  number,   // wins × 10 + totalXP (composite rank)
 * }>}
 */
export async function getPlayerReputation(walletAddress) {
  const connection    = getConnection();
  const winMintAddr   = process.env.BUDDY_WIN_MINT;
  const xpMintAddr    = process.env.BUDDY_XP_MINT;

  let wins    = 0;
  let totalXP = 0;

  try {
    const playerPubkey = new PublicKey(walletAddress);

    // ── Fetch BUDDY_WIN balance ─────────────────────────────────────────────
    if (winMintAddr) {
      const winMint = new PublicKey(winMintAddr);
      const winAta  = await getAssociatedTokenAddress(winMint, playerPubkey);
      try {
        const acct = await getAccount(connection, winAta);
        wins = Number(acct.amount);
      } catch {
        // ATA not yet created — player has 0 wins, which is fine
      }
    }

    // ── Fetch BUDDY_XP balance ──────────────────────────────────────────────
    if (xpMintAddr) {
      const xpMint = new PublicKey(xpMintAddr);
      const xpAta  = await getAssociatedTokenAddress(xpMint, playerPubkey);
      try {
        const acct = await getAccount(connection, xpAta);
        totalXP = Number(acct.amount);
      } catch {
        // ATA not yet created — player has 0 XP
      }
    }
  } catch (err) {
    console.error('[reputation] getPlayerReputation failed:', err.message);
  }

  return {
    walletAddress,
    wins,
    totalXP,
    // Composite score: wins are weighted 10× since they're harder to earn
    reputationScore: wins * 10 + totalXP,
  };
}
