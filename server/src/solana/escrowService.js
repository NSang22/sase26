/**
 * Server-Managed Solana Escrow
 *
 * The server holds a keypair (SERVER_WALLET_KEYPAIR). All players send SOL
 * directly to this wallet before the session starts. On session end, the server
 * sends the full pot to the winner, or splits evenly among tied players.
 *
 * Supports 2–4 players. Uses devnet by default.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';

export class EscrowService {
  constructor() {
    this.connection = new Connection(RPC_URL, 'confirmed');

    const raw = process.env.SERVER_WALLET_KEYPAIR;
    if (raw) {
      try {
        this.serverKeypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
      } catch (err) {
        console.error('[escrow] Invalid SERVER_WALLET_KEYPAIR — generating ephemeral:', err.message);
        this.serverKeypair = Keypair.generate();
      }
    } else {
      this.serverKeypair = Keypair.generate();
      console.warn(
        '[escrow] No SERVER_WALLET_KEYPAIR — generated ephemeral keypair:',
        this.serverKeypair.publicKey.toBase58()
      );
    }

    this.serverAddress = this.serverKeypair.publicKey.toBase58();
    console.log('[escrow] Server wallet:', this.serverAddress);
  }

  /** Returns the server wallet address — clients send SOL here. */
  getDepositAddress() {
    return this.serverAddress;
  }

  /**
   * Verify a player's deposit on-chain.
   * Checks the tx contains a transfer of at least `expectedLamports`
   * from `fromAddress` to the server wallet, and that the tx is confirmed.
   *
   * @param {string} txSignature
   * @param {string} fromAddress   - sender's wallet address
   * @param {number} expectedLamports
   * @returns {Promise<boolean>}
   */
  async verifyDeposit(txSignature, fromAddress, expectedLamports) {
    try {
      const tx = await this.connection.getParsedTransaction(txSignature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });

      if (!tx) {
        console.warn('[escrow] verifyDeposit: tx not found:', txSignature);
        return false;
      }
      if (tx.meta?.err) {
        console.warn('[escrow] verifyDeposit: tx has error:', JSON.stringify(tx.meta.err));
        return false;
      }

      for (const ix of tx.transaction.message.instructions) {
        if (
          ix.parsed?.type === 'transfer' &&
          ix.parsed.info.destination === this.serverAddress &&
          ix.parsed.info.source === fromAddress &&
          parseInt(ix.parsed.info.lamports) >= expectedLamports
        ) {
          return true;
        }
      }

      console.warn('[escrow] verifyDeposit: no matching transfer instruction found');
      return false;
    } catch (err) {
      console.error('[escrow] verifyDeposit error:', err.message);
      return false;
    }
  }

  /**
   * Build and send a payout transaction.
   * Accepts an array of { walletAddress, lamports } recipients.
   * All transfers are batched into a single transaction.
   *
   * @param {{ walletAddress: string, lamports: number }[]} recipients
   * @returns {Promise<string>} transaction signature
   */
  async payout(recipients) {
    if (!recipients.length) throw new Error('No recipients for payout');

    const tx = new Transaction();
    for (const { walletAddress, lamports } of recipients) {
      if (lamports <= 0) continue;
      tx.add(
        SystemProgram.transfer({
          fromPubkey: this.serverKeypair.publicKey,
          toPubkey: new PublicKey(walletAddress),
          lamports,
        })
      );
    }

    if (!tx.instructions.length) throw new Error('Payout transaction has no instructions');

    const sig = await sendAndConfirmTransaction(this.connection, tx, [this.serverKeypair]);
    return sig;
  }

  /**
   * Called by endSession. Calculates who to pay and sends the transaction.
   * - Single winner: winner receives the full pot (stakeAmount × playerCount)
   * - Tie: pot split evenly among all players with the highest session score.
   *   Any remainder from integer division stays in the server wallet.
   *
   * @param {object} summary - from room.getSummary()
   * @returns {Promise<string|null>} payout tx signature, or null if skipped/failed
   */
  async handleSessionPayout(summary) {
    if (summary.mode !== 'locked-in') return null;
    if (!summary.stakeAmount || summary.stakeAmount <= 0) return null;

    const pot = summary.stakeAmount * summary.players.length;

    let recipients;

    if (summary.winner) {
      // Single winner takes the whole pot
      if (!summary.winner.walletAddress) {
        console.warn('[escrow] Winner has no wallet address — skipping payout');
        return null;
      }
      recipients = [{ walletAddress: summary.winner.walletAddress, lamports: pot }];
    } else {
      // Tie: split among all players with the highest session score
      if (!summary.players.length) return null;
      const maxScore = summary.players[0].sessionScore; // players are sorted desc
      const tied = summary.players.filter((p) => p.sessionScore === maxScore);

      const missing = tied.filter((p) => !p.walletAddress);
      if (missing.length) {
        console.warn(
          '[escrow] Tied player(s) missing wallet address — skipping payout:',
          missing.map((p) => p.username)
        );
        return null;
      }

      const share = Math.floor(pot / tied.length);
      recipients = tied.map((p) => ({ walletAddress: p.walletAddress, lamports: share }));
    }

    // Sanity-check server balance before attempting
    try {
      const balance = await this.connection.getBalance(this.serverKeypair.publicKey);
      const totalPayout = recipients.reduce((s, r) => s + r.lamports, 0);
      if (balance < totalPayout) {
        console.error(
          `[escrow] Insufficient server balance: ${balance} lamports, need ${totalPayout}`
        );
        return null;
      }
    } catch (err) {
      console.warn('[escrow] Balance check failed — proceeding anyway:', err.message);
    }

    try {
      const txSig = await this.payout(recipients);
      console.log(
        `[escrow] Payout sent (${(pot / LAMPORTS_PER_SOL).toFixed(4)} SOL) → tx: ${txSig}`
      );
      return txSig;
    } catch (err) {
      console.error('[escrow] Payout failed:', err.message);
      return null;
    }
  }

  /** Current server wallet balance in SOL. */
  async getServerBalance() {
    const lamports = await this.connection.getBalance(this.serverKeypair.publicKey);
    return lamports / LAMPORTS_PER_SOL;
  }
}
