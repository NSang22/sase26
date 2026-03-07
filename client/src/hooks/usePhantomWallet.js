import { useState, useCallback, useEffect } from 'react';
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import axios from 'axios';
import { useGameStore } from '../store/gameStore.js';
import { socket } from '../lib/socket.js';

const RPC_URL = import.meta.env.VITE_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

/**
 * Phantom wallet integration hook.
 *
 * Escrow flow (server-managed):
 *   1. connect()       — connects Phantom, emits wallet address to server
 *   2. approveEscrow() — fetches server wallet address, builds + signs a SOL
 *                        transfer tx, sends it, then emits escrow_confirmed with
 *                        the tx signature so the server can verify on-chain
 */
export function usePhantomWallet() {
  const { walletAddress, setWalletAddress, room } = useGameStore();
  const [connecting, setConnecting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState(null);

  const phantom = typeof window !== 'undefined' ? window?.solana : null;
  const isPhantomInstalled = !!phantom?.isPhantom;

  const connect = useCallback(async () => {
    if (!isPhantomInstalled) {
      setError('Phantom wallet not found. Install it at phantom.app');
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const resp = await phantom.connect();
      const address = resp.publicKey.toString();
      setWalletAddress(address);
      if (room?.code) {
        socket.emit('wallet_connected', { roomCode: room.code, walletAddress: address });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setConnecting(false);
    }
  }, [isPhantomInstalled, phantom, setWalletAddress, room]);

  const disconnect = useCallback(async () => {
    if (!phantom) return;
    await phantom.disconnect();
    setWalletAddress(null);
  }, [phantom, setWalletAddress]);

  // Auto-reconnect if Phantom is already trusted
  useEffect(() => {
    if (!phantom || walletAddress) return;
    phantom.connect({ onlyIfTrusted: true })
      .then((resp) => setWalletAddress(resp.publicKey.toString()))
      .catch(() => {});
  }, [phantom, walletAddress, setWalletAddress]);

  /**
   * Send stakeAmount SOL to the server's escrow wallet.
   * Builds a standard SystemProgram.transfer tx, signs via Phantom,
   * sends it, and emits escrow_confirmed so the server can verify.
   */
  const approveEscrow = useCallback(
    async (stakeLamports, roomCode) => {
      if (!phantom || !walletAddress) throw new Error('Wallet not connected');

      setApproving(true);
      setError(null);
      try {
        // 1. Get the server's deposit address
        const { data } = await axios.get(`/api/rooms/${roomCode}/escrow-address`);
        const serverAddress = data.address;

        // 2. Build the transfer transaction
        const connection = new Connection(RPC_URL, 'confirmed');
        const fromPubkey = new PublicKey(walletAddress);
        const toPubkey = new PublicKey(serverAddress);

        const tx = new Transaction().add(
          SystemProgram.transfer({ fromPubkey, toPubkey, lamports: stakeLamports })
        );
        tx.feePayer = fromPubkey;
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

        // 3. Sign and send via Phantom
        const { signature } = await phantom.signAndSendTransaction(tx);
        await connection.confirmTransaction(signature, 'confirmed');

        // 4. Notify server — it will verify the tx on-chain
        socket.emit('escrow_confirmed', { roomCode, txSignature: signature, walletAddress });

        return signature;
      } catch (err) {
        setError(err.message);
        throw err;
      } finally {
        setApproving(false);
      }
    },
    [phantom, walletAddress]
  );

  return {
    walletAddress,
    isPhantomInstalled,
    connecting,
    approving,
    error,
    connect,
    disconnect,
    approveEscrow,
  };
}
