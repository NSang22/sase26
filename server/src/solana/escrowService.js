/**
 * Server-Managed Solana Escrow
 *
 * The server holds a keypair (SERVER_WALLET_KEYPAIR). Both players send SOL
 * directly to this wallet before the session starts. On session end, the server
 * sends the full pot to the winner (or refunds both on a tie).
 *
 * No on-chain program required — centralized custodial escrow, identical demo UX.
 * A future production version could use an Anchor program for trustless resolution.
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
      this.serverKeypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
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
   * Parses the transaction and checks it contains a transfer of at least
   * `expectedLamports` from `fromAddress` to the server wallet.
   */
  async verifyDeposit(txSignature, fromAddress, expectedLamports) {
    try {
      const tx = await this.connection.getParsedTransaction(txSignature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0,
      });
      if (!tx) return false;

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
      return false;
    } catch (err) {
      console.error('[escrow] verifyDeposit error:', err.message);
      return false;
    }
  }

  /**
   * Send payout from server wallet to winner, or refund both on a tie.
   *
   * @param {object} params
   * @param {string|null} params.winnerAddress  - null = tie
   * @param {string} params.player1Address
   * @param {string} params.player2Address
   * @param {number} params.stakeLamports       - per-player stake
   * @returns {string} transaction signature
   */
  async payout({ winnerAddress, player1Address, player2Address, stakeLamports }) {
    const tx = new Transaction();

    if (winnerAddress) {
      tx.add(
        SystemProgram.transfer({
          fromPubkey: this.serverKeypair.publicKey,
          toPubkey: new PublicKey(winnerAddress),
          lamports: stakeLamports * 2,
        })
      );
    } else {
      tx.add(
        SystemProgram.transfer({
          fromPubkey: this.serverKeypair.publicKey,
          toPubkey: new PublicKey(player1Address),
          lamports: stakeLamports,
        }),
        SystemProgram.transfer({
          fromPubkey: this.serverKeypair.publicKey,
          toPubkey: new PublicKey(player2Address),
          lamports: stakeLamports,
        })
      );
    }

    return sendAndConfirmTransaction(this.connection, tx, [this.serverKeypair]);
  }

  /**
   * Called by endSession. Returns payout tx signature or null.
   */
  async handleSessionPayout(summary) {
    if (summary.mode !== 'locked-in') return null;

    const [p1, p2] = summary.players;
    if (!p1?.walletAddress || !p2?.walletAddress) {
      console.warn('[escrow] Missing wallet addresses — skipping payout');
      return null;
    }

    try {
      const txSig = await this.payout({
        winnerAddress: summary.winner?.walletAddress ?? null,
        player1Address: p1.walletAddress,
        player2Address: p2.walletAddress,
        stakeLamports: summary.stakeAmount,
      });
      console.log('[escrow] Payout tx:', txSig);
      return txSig;
    } catch (err) {
      console.error('[escrow] Payout failed:', err.message);
      return null;
    }
  }

  async getServerBalance() {
    const lamports = await this.connection.getBalance(this.serverKeypair.publicKey);
    return lamports / LAMPORTS_PER_SOL;
  }
}
