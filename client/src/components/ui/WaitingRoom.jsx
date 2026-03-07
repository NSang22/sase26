import { useState, useRef } from 'react';
import axios from 'axios';
import { useGameStore } from '../../store/gameStore.js';
import { socket } from '../../lib/socket.js';
import { usePhantomWallet } from '../../hooks/usePhantomWallet.js';

const s = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    gap: 24,
    background: 'linear-gradient(135deg, #0a0a18 0%, #12122a 100%)',
  },
  title: { fontSize: 28, fontWeight: 800, color: '#a78bfa', letterSpacing: 1 },
  code: {
    background: '#1e1e3a',
    border: '1px solid #4c1d95',
    borderRadius: 12,
    padding: '10px 28px',
    fontSize: 32,
    letterSpacing: 8,
    fontWeight: 900,
    color: '#ddd6fe',
    fontFamily: 'monospace',
  },
  card: {
    background: '#16162a',
    border: '1px solid #2a2a4a',
    borderRadius: 16,
    padding: '28px 36px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    minWidth: 400,
  },
  playerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    background: '#0d0d1f',
    borderRadius: 8,
    gap: 12,
  },
  badge: (ready) => ({
    padding: '3px 10px',
    borderRadius: 20,
    background: ready ? '#4c1d95' : '#1e1e3a',
    color: ready ? '#ddd6fe' : '#666',
    fontSize: 12,
    fontWeight: 700,
  }),
  btn: (disabled) => ({
    padding: '12px 0',
    background: disabled ? '#2a2a4a' : '#7c3aed',
    color: disabled ? '#555' : '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    letterSpacing: 1,
  }),
  subBtn: {
    padding: '10px 0',
    background: 'transparent',
    color: '#6366f1',
    border: '1px solid #6366f1',
    borderRadius: 8,
    fontSize: 14,
    cursor: 'pointer',
  },
  label: { color: '#888', fontSize: 13 },
  tag: { color: '#a78bfa', fontSize: 13, fontWeight: 600 },
  upload: { display: 'none' },
  uploadLabel: {
    padding: '10px 16px',
    background: '#0d0d1f',
    border: '1px dashed #4c1d95',
    borderRadius: 8,
    color: '#888',
    cursor: 'pointer',
    textAlign: 'center',
    fontSize: 14,
  },
  stakeBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    background: '#0d0d1f',
    borderRadius: 8,
    border: '1px solid #4c1d95',
  },
  error: { color: '#f87171', fontSize: 13 },
};

export function WaitingRoom() {
  const { room, user } = useGameStore();
  const { walletAddress, isPhantomInstalled, connect, approveEscrow } = usePhantomWallet();
  const fileRef = useRef();
  const [uploading, setUploading] = useState(false);
  const [uploadDone, setUploadDone] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  if (!room) return null;

  const isHost = room.players.find((p) => p.socketId === socket.id)?.isHost;
  const isLockedIn = room.mode === 'locked-in';
  const needsWallet = isLockedIn && !walletAddress;
  const myPlayer = room.players.find((p) => p.socketId === socket.id);
  const stakeSOL = isLockedIn ? (room.stakeAmount / 1e9).toFixed(2) : null;

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await axios.post(`/api/rooms/${room.code}/material`, form);
      setUploadDone(true);
    } catch (err) {
      setError('Upload failed: ' + (err.response?.data?.error ?? err.message));
    } finally {
      setUploading(false);
    }
  }

  function handleReady() {
    socket.emit('player_ready', { roomCode: room.code });
    setReady(true);
  }

  async function handleApproveEscrow() {
    try {
      await approveEscrow(room.stakeAmount, room.code);
    } catch (err) {
      setError(err.message);
    }
  }

  const canReady = !isLockedIn || (walletAddress && myPlayer?.escrowConfirmed);

  return (
    <div style={s.root}>
      <div style={s.title}>Waiting Room</div>

      <div style={s.code}>{room.code}</div>
      <div style={s.label}>Share this code with your partner</div>

      <div style={s.card}>
        {/* Players */}
        {room.players.map((p) => (
          <div key={p.socketId} style={s.playerRow}>
            <span>{p.username} {p.isHost ? '(host)' : ''}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {isLockedIn && <span style={s.badge(p.escrowConfirmed)}>
                {p.escrowConfirmed ? 'Escrowed' : 'Pending SOL'}
              </span>}
              <span style={s.badge(p.ready)}>{p.ready ? 'Ready' : 'Not ready'}</span>
            </div>
          </div>
        ))}
        {room.players.length < 2 && (
          <div style={s.playerRow}>
            <span style={{ color: '#555' }}>Waiting for partner...</span>
          </div>
        )}

        {/* Study material upload (host only) */}
        {isHost && (
          <>
            <div style={s.label}>Upload study material (PDF or .txt)</div>
            {uploadDone ? (
              <div style={{ ...s.tag, textAlign: 'center' }}>Quiz bank generated!</div>
            ) : (
              <>
                <label style={s.uploadLabel} htmlFor="material-upload">
                  {uploading ? 'Generating quiz...' : 'Click to upload file'}
                </label>
                <input
                  id="material-upload"
                  type="file"
                  style={s.upload}
                  accept=".pdf,.txt,.md"
                  onChange={handleUpload}
                  disabled={uploading}
                />
              </>
            )}
          </>
        )}

        {/* Locked-In wallet section */}
        {isLockedIn && (
          <div style={s.stakeBox}>
            <span>Stake:</span>
            <span style={s.tag}>{stakeSOL} SOL each</span>
            {!walletAddress ? (
              <button style={{ ...s.subBtn, marginLeft: 'auto' }} onClick={connect}>
                {isPhantomInstalled ? 'Connect Phantom' : 'Get Phantom →'}
              </button>
            ) : !myPlayer?.escrowConfirmed ? (
              <button style={{ ...s.subBtn, marginLeft: 'auto' }} onClick={handleApproveEscrow}>
                Approve Escrow
              </button>
            ) : (
              <span style={{ ...s.tag, marginLeft: 'auto' }}>Confirmed</span>
            )}
          </div>
        )}

        {error && <div style={s.error}>{error}</div>}

        <button style={s.btn(!canReady || ready)} onClick={handleReady} disabled={!canReady || ready}>
          {ready ? 'Waiting for partner...' : 'Ready'}
        </button>
      </div>
    </div>
  );
}
