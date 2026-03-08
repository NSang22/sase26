import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { useGameStore } from '../../store/gameStore.js';
import { socket } from '../../lib/socket.js';
import { usePhantomWallet } from '../../hooks/usePhantomWallet.js';
import {
  POKEMON_SPRITES,
  fillRect,
  drawPixelPokemon,
  drawParticle,
  drawStar,
  drawGround,
} from '../../lib/pixelArt.js';

// ── Pokemon buddy data ────────────────────────────────────────────────────────

const BUDDIES = [
  { name: 'Pikachu',   color: '#F8D030' },
  { name: 'Jigglypuff', color: '#FFB8E0' },
  { name: 'Bulbasaur', color: '#68B868' },
  { name: 'Squirtle',  color: '#58A8E8' },
  { name: 'Charmander',color: '#F08830' },
];

// ── Animated mini canvas for each buddy card ─────────────────────────────────

function BuddyMiniCanvas({ type, greyed }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let frame = 0;
    let animId;

    const draw = () => {
      ctx.clearRect(0, 0, 64, 64);
      if (greyed) ctx.globalAlpha = 0.35;
      drawPixelPokemon(ctx, 10, 14, type, frame++, 2);
      ctx.globalAlpha = 1;
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(animId);
  }, [type, greyed]);

  return (
    <canvas
      ref={canvasRef}
      width={64}
      height={64}
      style={{ width: 64, height: 64, imageRendering: 'pixelated' }}
    />
  );
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
  const { room, user, setPhase } = useGameStore();
  const { walletAddress, isPhantomInstalled, connect, approveEscrow } = usePhantomWallet();
  const fileRef = useRef();
  const [uploading, setUploading] = useState(false);
  const [uploadDone, setUploadDone] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [selectedBuddy, setSelectedBuddy] = useState(null);
  const [takenBuddies, setTakenBuddies] = useState(room?.buddySelections || {});
  const [duration, setDuration] = useState(room?.duration ?? 25);
  const [quizMode, setQuizMode] = useState(room?.quizMode || 'frequency');
  const [quizValue, setQuizValue] = useState(room?.quizValue ?? 5);
  const [mode, setMode] = useState(room?.mode || 'casual');
  const [stakeAmount, setStakeAmount] = useState(room?.stakeAmount ? room.stakeAmount / 1e9 : 0.1);
  const [materials, setMaterials] = useState([]);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [uploadTab, setUploadTab] = useState('upload'); // 'upload' | 'library'
  const [startError, setStartError] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);

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

    const pokemonPositions = [
      { type: 'pikachu',    x: 80  },
      { type: 'jigglypuff', x: 220 },
      { type: 'bulbasaur',  x: 800 },
      { type: 'squirtle',   x: 940 },
      { type: 'charmander', x: 520 },
    ];

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

      // Pokemon sprites bouncing on the grass
      const groundY = h - 100;
      pokemonPositions.forEach((pkmn, i) => {
        const yPos = groundY - 52 + Math.sin(frame * 0.06 + i * 1.5) * 3;
        drawPixelPokemon(ctx, pkmn.x, yPos, pkmn.type, frame + i * 20, 3);
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText(POKEMON_SPRITES[pkmn.type].name, pkmn.x + 24, yPos - 8);
      });

      // Pokeball decorations on ground
      const pokeballPositions = [
        { x: 400, y: groundY + 8 },
        { x: 650, y: groundY + 12 },
        { x: 150, y: groundY + 10 },
      ];
      pokeballPositions.forEach((pb) => {
        ctx.fillStyle = '#E85050';
        fillRect(ctx, pb.x, pb.y, 10, 5);
        ctx.fillStyle = '#F8F8F8';
        fillRect(ctx, pb.x, pb.y + 5, 10, 5);
        ctx.fillStyle = '#282828';
        fillRect(ctx, pb.x, pb.y + 4, 10, 2);
        ctx.fillStyle = '#F8F8F8';
        fillRect(ctx, pb.x + 4, pb.y + 3, 3, 3);
      });

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, []);

  useEffect(() => {
    socket.on('buddy_update', (data) => setTakenBuddies(data));
    return () => socket.off('buddy_update');
  }, []);

  useEffect(() => {
    socket.on('settings_updated', (data) => {
      setDuration(data.duration);
      setQuizMode(data.quizMode);
      setQuizValue(data.quizValue);
    });
    return () => socket.off('settings_updated');
  }, []);

  useEffect(() => {
    socket.on('session_start', () => setPhase('session'));
    return () => socket.off('session_start');
  }, []);

  useEffect(() => {
    socket.on('mode_updated', (data) => {
      setMode(data.mode);
      setStakeAmount(data.stakeAmount / 1e9);
    });
    return () => socket.off('mode_updated');
  }, []);

  useEffect(() => {
    axios.get('/api/users/materials')
      .then((res) => setMaterials(res.data))
      .catch(() => {});
  }, []);

  if (!room) return null;

  const isHost = room.players.find((p) => p.socketId === socket.id)?.isHost;
  const isLockedIn = mode === 'locked-in';
  const needsWallet = isLockedIn && !walletAddress;
  const myPlayer = room.players.find((p) => p.socketId === socket.id);
  const stakeSOL = isLockedIn ? stakeAmount.toFixed(2) : null;

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

  async function handleReuseMaterial() {
    if (!selectedMaterial) return;
    try {
      await axios.post(`/api/rooms/${room.code}/material/reuse`, { materialId: selectedMaterial.id });
      setUploadDone(true);
    } catch (err) {
      setError('Failed to load material: ' + (err.response?.data?.error ?? err.message));
    }
  }

  async function handleApproveEscrow() {
    try {
      await approveEscrow(room.stakeAmount, room.code);
    } catch (err) {
      setError(err.message);
    }
  }

  const canReady = !isLockedIn || (walletAddress && myPlayer?.escrowConfirmed);

  function handleSelectBuddy(buddyName) {
    setSelectedBuddy(buddyName);
    socket.emit('select_buddy', { roomCode: room.code, buddy: buddyName });
  }

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

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative', zIndex: 10 }}>
        <div style={s.code}>{room.code}</div>
        <button
          onClick={() => {
            navigator.clipboard.writeText(room.code);
            setCodeCopied(true);
            setTimeout(() => setCodeCopied(false), 1500);
          }}
          style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: 8,
            padding: '5px 12px',
            background: codeCopied ? '#F8D030' : 'transparent',
            color: codeCopied ? '#222' : '#F8D030',
            border: '2px solid rgba(248,208,48,0.6)',
            borderRadius: 4,
            cursor: 'pointer',
            boxShadow: '0 0 6px rgba(248,208,48,0.2)',
            transition: 'background 0.2s, color 0.2s',
          }}
        >
          {codeCopied ? 'COPIED!' : 'COPY'}
        </button>
      </div>
      <div style={s.label}>Share this code with your partner</div>

      <div style={s.card}>
        {/* Players */}
        {room.players.map((p) => {
          const playerBuddy = Object.entries(takenBuddies).find(([, uname]) => uname === p.username)?.[0];
          const buddyColor = playerBuddy ? BUDDIES.find((b) => b.name === playerBuddy)?.color : null;
          return (
            <div key={p.socketId} style={s.playerRow}>
              <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 8, color: '#CCC' }}>
                {p.username}{p.isHost ? ' (host)' : ''}
                {playerBuddy && (
                  <span style={{ color: buddyColor, fontSize: 7 }}> [{playerBuddy}]</span>
                )}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                {isLockedIn && <span style={s.badge(p.escrowConfirmed)}>
                  {p.escrowConfirmed ? 'Escrowed' : 'Pending SOL'}
                </span>}
                <span style={s.badge(p.ready)}>{p.ready ? 'Ready' : 'Not ready'}</span>
              </div>
            </div>
          );
        })}
        {room.players.length < 2 && (
          <div style={s.playerRow}>
            <span style={{ color: '#444466', fontFamily: "'Press Start 2P', monospace", fontSize: 8 }}>Waiting for partner...</span>
          </div>
        )}

        {/* Buddy selection */}
        <div style={s.label}>CHOOSE YOUR BUDDY</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          {BUDDIES.map((buddy) => {
            const takenBy = takenBuddies[buddy.name];
            const isSelected = selectedBuddy === buddy.name;
            const isTaken = takenBy && takenBy !== user?.username;
            return (
              <div
                key={buddy.name}
                onClick={() => !isTaken && handleSelectBuddy(buddy.name)}
                style={{
                  width: 80,
                  textAlign: 'center',
                  cursor: isTaken ? 'not-allowed' : 'pointer',
                  padding: '8px 4px',
                  borderRadius: 8,
                  border: isSelected ? `2px solid ${buddy.color}` : '2px solid rgba(255,255,255,0.1)',
                  backgroundColor: isSelected ? `${buddy.color}22` : 'rgba(255,255,255,0.03)',
                  boxShadow: isSelected ? `0 0 15px ${buddy.color}44` : 'none',
                  opacity: isTaken ? 0.4 : 1,
                  transition: 'all 0.2s',
                }}
              >
                <BuddyMiniCanvas type={buddy.name.toLowerCase()} greyed={isTaken} />
                <div
                  style={{
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: 6,
                    color: isSelected ? buddy.color : isTaken ? '#444' : '#8888AA',
                  }}
                >
                  {buddy.name}
                </div>
                {isTaken && (
                  <div
                    style={{
                      fontFamily: "'Press Start 2P', monospace",
                      fontSize: 5,
                      color: '#555566',
                      marginTop: 3,
                    }}
                  >
                    {takenBy}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Session settings */}
        {isHost ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ ...s.label, color: '#F8D030' }}>SESSION SETTINGS</div>

            {/* Duration */}
            <div style={s.label}>SESSION DURATION</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[15, 25, 45, 60].map((mins) => {
                const active = duration === mins;
                return (
                  <button
                    key={mins}
                    onClick={() => {
                      setDuration(mins);
                      socket.emit('update_settings', { roomCode: room.code, duration: mins, quizMode, quizValue });
                    }}
                    style={{
                      fontFamily: "'Press Start 2P', monospace",
                      fontSize: 7,
                      padding: '6px 12px',
                      borderRadius: 4,
                      border: active ? '2px solid #F8D030' : '2px solid rgba(255,255,255,0.1)',
                      background: active ? '#F8D030' : 'rgba(0,0,0,0.3)',
                      color: active ? '#0A0A2E' : '#8888AA',
                      cursor: 'pointer',
                      boxShadow: active ? '0 0 8px rgba(248,208,48,0.4)' : 'none',
                      transition: 'all 0.15s',
                    }}
                  >
                    {mins === 60 ? '1hr' : `${mins}m`}
                  </button>
                );
              })}
            </div>

            {/* Quiz mode toggle */}
            <div style={s.label}>QUIZ MODE</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {['frequency', 'total'].map((mode) => {
                const active = quizMode === mode;
                return (
                  <button
                    key={mode}
                    onClick={() => {
                      setQuizMode(mode);
                      socket.emit('update_settings', { roomCode: room.code, duration, quizMode: mode, quizValue });
                    }}
                    style={{
                      fontFamily: "'Press Start 2P', monospace",
                      fontSize: 7,
                      padding: '6px 12px',
                      borderRadius: 4,
                      border: active ? '2px solid #F8D030' : '2px solid rgba(255,255,255,0.1)',
                      background: active ? '#F8D030' : 'rgba(0,0,0,0.3)',
                      color: active ? '#0A0A2E' : '#8888AA',
                      cursor: 'pointer',
                      boxShadow: active ? '0 0 8px rgba(248,208,48,0.4)' : 'none',
                      transition: 'all 0.15s',
                    }}
                  >
                    {mode === 'frequency' ? 'FREQUENCY' : 'TOTAL'}
                  </button>
                );
              })}
            </div>

            {/* Quiz value options */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(quizMode === 'frequency' ? [3, 5, 7, 10] : [3, 5, 8, 10, 15]).map((v) => {
                const active = quizValue === v;
                return (
                  <button
                    key={v}
                    onClick={() => {
                      setQuizValue(v);
                      socket.emit('update_settings', { roomCode: room.code, duration, quizMode, quizValue: v });
                    }}
                    style={{
                      fontFamily: "'Press Start 2P', monospace",
                      fontSize: 7,
                      padding: '6px 12px',
                      borderRadius: 4,
                      border: active ? '2px solid #F8D030' : '2px solid rgba(255,255,255,0.1)',
                      background: active ? '#F8D030' : 'rgba(0,0,0,0.3)',
                      color: active ? '#0A0A2E' : '#8888AA',
                      cursor: 'pointer',
                      boxShadow: active ? '0 0 8px rgba(248,208,48,0.4)' : 'none',
                      transition: 'all 0.15s',
                    }}
                  >
                    {quizMode === 'frequency' ? `${v}min` : `${v}`}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ ...s.label, color: '#F8D030' }}>SESSION SETTINGS</div>
            <div style={{
              backgroundColor: 'rgba(0,0,0,0.3)',
              borderRadius: 6,
              padding: '8px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}>
              <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: '#8888BB' }}>
                Duration: <span style={{ color: '#CCC' }}>{duration} min</span>
              </span>
              <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: '#8888BB' }}>
                Quizzes:{' '}
                <span style={{ color: '#CCC' }}>
                  {quizMode === 'frequency' ? `Every ${quizValue} min` : `${quizValue} total`}
                </span>
              </span>
            </div>
          </div>
        )}

        {/* Session mode */}
        {isHost ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ ...s.label, color: '#F8D030' }}>SESSION MODE</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[
                { value: 'casual',    label: 'CASUAL',     color: '#68B868' },
                { value: 'locked-in', label: '⬡ LOCKED IN', color: '#E85050' },
              ].map(({ value, label, color }) => {
                const active = mode === value;
                return (
                  <button
                    key={value}
                    onClick={() => {
                      setMode(value);
                      socket.emit('update_mode', {
                        roomCode: room.code,
                        mode: value,
                        stakeAmount: stakeAmount * 1e9,
                      });
                    }}
                    style={{
                      fontFamily: "'Press Start 2P', monospace",
                      fontSize: 7,
                      padding: '6px 12px',
                      borderRadius: 4,
                      border: active ? `2px solid ${color}` : '2px solid rgba(255,255,255,0.1)',
                      background: active ? color : 'rgba(0,0,0,0.3)',
                      color: active ? '#fff' : '#8888AA',
                      cursor: 'pointer',
                      boxShadow: active ? `0 0 10px ${color}66` : 'none',
                      transition: 'all 0.15s',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {isLockedIn && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={s.label}>STAKE AMOUNT</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[0.05, 0.1, 0.25, 0.5].map((amt) => {
                    const active = stakeAmount === amt;
                    return (
                      <button
                        key={amt}
                        onClick={() => {
                          setStakeAmount(amt);
                          socket.emit('update_mode', {
                            roomCode: room.code,
                            mode,
                            stakeAmount: amt * 1e9,
                          });
                        }}
                        style={{
                          fontFamily: "'Press Start 2P', monospace",
                          fontSize: 7,
                          padding: '6px 12px',
                          borderRadius: 4,
                          border: active ? '2px solid #E85050' : '2px solid rgba(255,255,255,0.1)',
                          background: active ? '#E85050' : 'rgba(0,0,0,0.3)',
                          color: active ? '#fff' : '#8888AA',
                          cursor: 'pointer',
                          boxShadow: active ? '0 0 8px rgba(232,80,80,0.4)' : 'none',
                          transition: 'all 0.15s',
                        }}
                      >
                        {amt} SOL
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ ...s.label, color: '#F8D030' }}>SESSION MODE</div>
            <div style={{
              backgroundColor: 'rgba(0,0,0,0.3)',
              borderRadius: 6,
              padding: '8px 12px',
            }}>
              <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 7, color: '#8888BB' }}>
                Mode:{' '}
                <span style={{ color: isLockedIn ? '#E85050' : '#68B868' }}>
                  {isLockedIn ? `Locked In (${stakeAmount.toFixed(2)} SOL)` : 'Casual'}
                </span>
              </span>
            </div>
          </div>
        )}

        {/* Study material upload (host only) */}
        {isHost && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ ...s.label, color: '#F8D030' }}>STUDY MATERIAL</div>
            {uploadDone ? (
              <div style={{ ...s.tag, textAlign: 'center' }}>Quiz bank generated!</div>
            ) : (
              <>
                {/* Tabs — only rendered when there are previous materials */}
                {materials.length > 0 && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[
                      { id: 'upload',  label: 'UPLOAD NEW' },
                      { id: 'library', label: 'MY LIBRARY' },
                    ].map(({ id, label }) => {
                      const active = uploadTab === id;
                      return (
                        <button
                          key={id}
                          onClick={() => setUploadTab(id)}
                          style={{
                            fontFamily: "'Press Start 2P', monospace",
                            fontSize: 7,
                            padding: '6px 10px',
                            borderRadius: 4,
                            border: active ? '2px solid #F8D030' : '2px solid rgba(255,255,255,0.1)',
                            background: active ? '#F8D030' : 'rgba(0,0,0,0.3)',
                            color: active ? '#0A0A2E' : '#8888AA',
                            cursor: 'pointer',
                            boxShadow: active ? '0 0 8px rgba(248,208,48,0.4)' : 'none',
                            transition: 'all 0.15s',
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Upload tab (default; always shown when no materials) */}
                {(uploadTab === 'upload' || materials.length === 0) ? (
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
                ) : (
                  /* Library tab */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{
                      maxHeight: 120,
                      overflowY: 'auto',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}>
                      {materials.length === 0 ? (
                        <span style={{
                          fontFamily: "'Press Start 2P', monospace",
                          fontSize: 6,
                          color: '#444466',
                        }}>
                          NO PREVIOUS MATERIALS
                        </span>
                      ) : materials.map((mat) => {
                        const isSelected = selectedMaterial?.id === mat.id;
                        return (
                          <div
                            key={mat.id}
                            onClick={() => setSelectedMaterial(mat)}
                            style={{
                              padding: '6px 10px',
                              borderRadius: 4,
                              border: isSelected ? '2px solid #F8D030' : '2px solid rgba(255,255,255,0.08)',
                              background: isSelected ? 'rgba(248,208,48,0.08)' : 'rgba(0,0,0,0.3)',
                              boxShadow: isSelected ? '0 0 8px rgba(248,208,48,0.2)' : 'none',
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 3,
                              transition: 'all 0.15s',
                            }}
                          >
                            <span style={{
                              fontFamily: "'Press Start 2P', monospace",
                              fontSize: 7,
                              color: '#CCC',
                            }}>
                              {mat.filename}
                            </span>
                            <span style={{
                              fontFamily: "'Press Start 2P', monospace",
                              fontSize: 5,
                              color: '#555566',
                            }}>
                              {new Date(mat.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <button
                      onClick={handleReuseMaterial}
                      disabled={!selectedMaterial}
                      style={{
                        fontFamily: "'Press Start 2P', monospace",
                        fontSize: 7,
                        padding: '8px 0',
                        borderRadius: 4,
                        border: 'none',
                        background: selectedMaterial ? '#F8D030' : '#1a1a2e',
                        color: selectedMaterial ? '#0A0A2E' : '#555',
                        cursor: selectedMaterial ? 'pointer' : 'not-allowed',
                        opacity: selectedMaterial ? 1 : 0.4,
                        boxShadow: selectedMaterial
                          ? '0 3px 0 #B8860B, 0 0 10px rgba(248,208,48,0.3)'
                          : 'none',
                        letterSpacing: 1,
                        transition: 'all 0.15s',
                      }}
                    >
                      USE THIS
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
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

        {/* Bottom action button */}
        {isHost ? (() => {
          const enoughPlayers = room.players.length >= 2;
          const allReady = enoughPlayers && room.players.every((p) => p.ready);
          const allEscrowConfirmed = room.players.every((p) => p.escrowConfirmed);
          const canStart = allReady && (!isLockedIn || allEscrowConfirmed);
          const solPending = isLockedIn && allReady && !allEscrowConfirmed;
          const statusText = !enoughPlayers
            ? 'NEED AT LEAST 2 PLAYERS'
            : !allReady
            ? 'WAITING FOR ALL PLAYERS TO READY UP'
            : solPending
            ? 'WAITING FOR SOL...'
            : 'ALL PLAYERS READY!';
          const statusColor = canStart ? '#68B868' : solPending ? '#F8D030' : '#444466';
          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => {
                  if (ready) {
                    socket.emit('player_unready', { roomCode: room.code });
                    setReady(false);
                  } else {
                    socket.emit('player_ready', { roomCode: room.code });
                    setReady(true);
                  }
                }}
                style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: 10,
                  padding: '12px 24px',
                  background: ready ? '#E85050' : '#68B868',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  letterSpacing: 1,
                  boxShadow: ready
                    ? '0 4px 0 #8B2020, 0 0 12px rgba(232,80,80,0.3)'
                    : '0 4px 0 #3d7a3d, 0 0 12px rgba(104,184,104,0.3)',
                  textShadow: '0 2px 4px rgba(0,0,0,0.4)',
                  width: '100%',
                }}
              >
                {ready ? 'UNREADY' : 'READY UP'}
              </button>
              <button
                disabled={!canStart && !solPending}
                onClick={() => {
                  if (solPending) {
                    setStartError('ALL PLAYERS NEED TO LINK SOL FIRST!');
                    setTimeout(() => setStartError(''), 3000);
                    return;
                  }
                  socket.emit('start_session', { roomCode: room.code });
                }}
                style={{
                  fontFamily: "'Press Start 2P', monospace",
                  fontSize: 10,
                  padding: '12px 24px',
                  background: canStart ? '#68B868' : solPending ? '#F8D030' : '#1a1a2e',
                  color: canStart ? '#fff' : solPending ? '#0A0A2E' : '#555',
                  border: 'none',
                  borderRadius: 4,
                  cursor: canStart || solPending ? 'pointer' : 'not-allowed',
                  opacity: canStart || solPending ? 1 : 0.4,
                  letterSpacing: 1,
                  boxShadow: canStart
                    ? '0 4px 0 #3d7a3d, 0 0 12px rgba(104,184,104,0.4)'
                    : solPending
                    ? '0 4px 0 #B8860B, 0 0 12px rgba(248,208,48,0.4)'
                    : 'none',
                  textShadow: canStart || solPending ? '0 1px 0 rgba(0,0,0,0.3)' : 'none',
                  width: '100%',
                }}
              >
                START SESSION
              </button>
              {startError ? (
                <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: '#E85050' }}>
                  {startError}
                </span>
              ) : (
                <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: statusColor }}>
                  {statusText}
                </span>
              )}
            </div>
          );
        })() : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => {
                if (ready) {
                  socket.emit('player_unready', { roomCode: room.code });
                  setReady(false);
                } else {
                  socket.emit('player_ready', { roomCode: room.code });
                  setReady(true);
                }
              }}
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: 10,
                padding: '12px 24px',
                background: ready ? '#E85050' : '#68B868',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
                letterSpacing: 1,
                boxShadow: ready
                  ? '0 4px 0 #8B2020, 0 0 12px rgba(232,80,80,0.3)'
                  : '0 4px 0 #3d7a3d, 0 0 12px rgba(104,184,104,0.3)',
                textShadow: '0 2px 4px rgba(0,0,0,0.4)',
                width: '100%',
              }}
            >
              {ready ? 'UNREADY' : 'READY UP'}
            </button>
            {ready && (
              <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 6, color: '#444466' }}>
                WAITING FOR HOST TO START...
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
