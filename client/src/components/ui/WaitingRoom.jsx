import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { useGameStore } from '../../store/gameStore.js';
import { socket } from '../../lib/socket.js';
import { usePhantomWallet } from '../../hooks/usePhantomWallet.js';

// ── Canvas background helpers (same as LandingPage) ──────────────────────────

function fillRect(ctx, x, y, w, h) {
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

function drawParticle(ctx, x, y, size, color, alpha) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  fillRect(ctx, x, y, size, size);
  ctx.globalAlpha = 1;
}

function drawStar(ctx, x, y, frame, seed) {
  const twinkle = Math.sin(frame * 0.03 + seed * 7) * 0.5 + 0.5;
  const size = seed > 0.7 ? 3 : seed > 0.4 ? 2 : 1;
  ctx.globalAlpha = twinkle * 0.8 + 0.2;
  ctx.fillStyle = seed > 0.8 ? '#F8D030' : seed > 0.5 ? '#A8D8F8' : '#FFFFFF';
  fillRect(ctx, x, y, size, size);
  ctx.globalAlpha = 1;
}

function drawGround(ctx, width, height, frame) {
  const tileSize = 24;
  const groundY = height - 100;

  ctx.fillStyle = '#2D5A1E';
  ctx.fillRect(0, groundY, width, 100);

  for (let x = 0; x < width; x += tileSize) {
    ctx.fillStyle = x % (tileSize * 2) === 0 ? '#347A24' : '#2D6A1E';
    ctx.fillRect(x, groundY, tileSize, 4);

    if (Math.sin(x * 0.5 + frame * 0.02) > 0.3) {
      ctx.fillStyle = '#4CAF50';
      const bladeOffset = Math.sin(frame * 0.05 + x * 0.1) * 2;
      fillRect(ctx, x + 4 + bladeOffset, groundY - 4, 2, 6);
      fillRect(ctx, x + 14 + bladeOffset * 0.7, groundY - 3, 2, 5);
    }
  }

  ctx.fillStyle = '#8B7355';
  ctx.fillRect(0, groundY + 20, width, 30);
  ctx.fillStyle = '#9B8365';
  for (let x = 0; x < width; x += 32) {
    ctx.fillRect(x + 2, groundY + 22, 28, 26);
  }
  ctx.fillStyle = '#7B6345';
  for (let x = 0; x < width; x += 32) {
    ctx.fillRect(x, groundY + 20, 32, 2);
  }
}

// ── Pixel art styles ──────────────────────────────────────────────────────────

const s = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    gap: 20,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#0A0A2E',
  },
  title: {
    fontFamily: "'Press Start 2P', monospace",
    fontSize: 16,
    color: '#F8D030',
    textShadow: '0 0 15px rgba(248,208,48,0.3), 0 2px 0 #B8860B',
    position: 'relative',
    zIndex: 10,
  },
  code: {
    fontFamily: "'Press Start 2P', monospace",
    fontSize: 28,
    color: '#F8D030',
    letterSpacing: 8,
    textShadow: '0 0 20px rgba(248,208,48,0.5)',
    position: 'relative',
    zIndex: 10,
  },
  card: {
    backgroundColor: 'rgba(10,10,46,0.85)',
    border: '2px solid rgba(248,208,48,0.2)',
    borderRadius: 12,
    boxShadow: '0 0 40px rgba(0,0,0,0.5)',
    backdropFilter: 'blur(8px)',
    padding: '24px 32px',
    maxWidth: 600,
    maxHeight: '90vh',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    minWidth: 400,
    position: 'relative',
    zIndex: 10,
  },
  playerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 12px',
    background: 'rgba(0,0,0,0.3)',
    borderRadius: 6,
    gap: 12,
  },
  badge: (ready) => ({
    fontFamily: "'Press Start 2P', monospace",
    padding: '3px 8px',
    borderRadius: 4,
    background: ready ? '#68B868' : '#1a1a2e',
    color: ready ? '#fff' : '#555',
    fontSize: 7,
    boxShadow: ready ? '0 0 8px rgba(104,184,104,0.5)' : 'none',
  }),
  btn: (disabled) => ({
    fontFamily: "'Press Start 2P', monospace",
    padding: '12px 0',
    background: disabled ? '#1a1a2e' : '#68B868',
    color: disabled ? '#555' : '#fff',
    border: 'none',
    borderRadius: 4,
    fontSize: 10,
    cursor: disabled ? 'not-allowed' : 'pointer',
    letterSpacing: 1,
    boxShadow: disabled
      ? 'none'
      : '0 4px 0 #3d7a3d, 0 0 12px rgba(104,184,104,0.3)',
    textShadow: '0 2px 4px rgba(0,0,0,0.5)',
  }),
  subBtn: {
    fontFamily: "'Press Start 2P', monospace",
    padding: '8px 16px',
    background: 'transparent',
    color: '#F8D030',
    border: '2px solid rgba(248,208,48,0.5)',
    borderRadius: 4,
    fontSize: 8,
    cursor: 'pointer',
    letterSpacing: 1,
    boxShadow: '0 0 8px rgba(248,208,48,0.2)',
  },
  label: {
    fontFamily: "'Press Start 2P', monospace",
    color: '#8888BB',
    fontSize: 7,
    position: 'relative',
    zIndex: 10,
  },
  tag: {
    fontFamily: "'Press Start 2P', monospace",
    color: '#F8D030',
    fontSize: 8,
    textShadow: '0 0 8px rgba(248,208,48,0.4)',
  },
  upload: { display: 'none' },
  uploadLabel: {
    fontFamily: "'Press Start 2P', monospace",
    padding: '10px 16px',
    background: 'rgba(0,0,0,0.4)',
    border: '2px dashed rgba(248,208,48,0.4)',
    borderRadius: 8,
    color: '#8888BB',
    cursor: 'pointer',
    textAlign: 'center',
    fontSize: 8,
  },
  stakeBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 14px',
    background: 'rgba(0,0,0,0.4)',
    borderRadius: 8,
    border: '2px solid rgba(248,208,48,0.2)',
  },
  error: {
    fontFamily: "'Press Start 2P', monospace",
    color: '#E85050',
    fontSize: 8,
  },
};

export function WaitingRoom() {
  const { room, user } = useGameStore();
  const { walletAddress, isPhantomInstalled, connect, approveEscrow } = usePhantomWallet();
  const fileRef = useRef();
  const [uploading, setUploading] = useState(false);
  const [uploadDone, setUploadDone] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  // Canvas background
  const canvasRef = useRef(null);
  const frameRef = useRef(0);
  const starsRef = useRef([]);
  const particlesRef = useRef([]);

  useEffect(() => {
    const stars = [];
    for (let i = 0; i < 120; i++) {
      stars.push({ x: Math.random() * 1200, y: Math.random() * 500, seed: Math.random() });
    }
    starsRef.current = stars;

    const particles = [];
    for (let i = 0; i < 20; i++) {
      particles.push({
        x: Math.random() * 1200,
        y: Math.random() * 600,
        vy: -0.3 - Math.random() * 0.5,
        size: 2 + Math.random() * 3,
        color: ['#F8D030', '#58A8E8', '#68B868', '#F08830', '#E85050'][Math.floor(Math.random() * 5)],
        alpha: 0.3 + Math.random() * 0.4,
        life: Math.random() * 200,
      });
    }
    particlesRef.current = particles;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;

    const render = () => {
      const frame = frameRef.current++;
      const w = canvas.width;
      const h = canvas.height;

      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#0A0A2E');
      grad.addColorStop(0.4, '#16163A');
      grad.addColorStop(0.7, '#1A2847');
      grad.addColorStop(1, '#1E3A20');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      starsRef.current.forEach((star) => {
        drawStar(ctx, star.x, star.y, frame, star.seed);
      });

      // Crescent moon (top right)
      ctx.fillStyle = '#FFFDE8';
      ctx.beginPath();
      ctx.arc(950, 80, 35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0A0A2E';
      ctx.beginPath();
      ctx.arc(940, 75, 30, 0, Math.PI * 2);
      ctx.fill();

      particlesRef.current.forEach((p) => {
        p.y += p.vy;
        p.x += Math.sin(frame * 0.02 + p.life) * 0.3;
        p.life++;
        if (p.y < -10) {
          p.y = h + 10;
          p.x = Math.random() * w;
        }
        drawParticle(ctx, p.x, p.y, p.size, p.color, p.alpha * (Math.sin(p.life * 0.03) * 0.3 + 0.7));
      });

      drawGround(ctx, w, h, frame);

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, []);

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
      <link
        href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap"
        rel="stylesheet"
      />

      <canvas
        ref={canvasRef}
        width={1100}
        height={650}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          imageRendering: 'pixelated',
          zIndex: 0,
        }}
      />

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
            <span style={{ color: '#444466', fontFamily: "'Press Start 2P', monospace", fontSize: 8 }}>Waiting for partner...</span>
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
