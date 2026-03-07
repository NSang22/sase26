import { useState } from 'react';
import axios from 'axios';
import { useGameStore } from '../../store/gameStore.js';
import { socket, connectSocket } from '../../lib/socket.js';

const PET_SPECIES = ['cat', 'dog', 'owl'];

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    gap: 24,
    background: 'linear-gradient(135deg, #0a0a18 0%, #12122a 100%)',
  },
  title: { fontSize: 48, fontWeight: 800, letterSpacing: 2, color: '#a78bfa' },
  tagline: { color: '#888', fontSize: 16, marginTop: -16 },
  card: {
    background: '#16162a',
    border: '1px solid #2a2a4a',
    borderRadius: 16,
    padding: '32px 40px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    minWidth: 360,
  },
  input: {
    padding: '10px 14px',
    background: '#0d0d1f',
    border: '1px solid #2a2a4a',
    borderRadius: 8,
    color: '#e8e8f0',
    fontSize: 15,
    outline: 'none',
  },
  btn: {
    padding: '12px 0',
    background: '#7c3aed',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    letterSpacing: 1,
  },
  row: { display: 'flex', gap: 12 },
  petBtn: (selected) => ({
    flex: 1,
    padding: '10px 0',
    background: selected ? '#7c3aed' : '#0d0d1f',
    border: `1px solid ${selected ? '#7c3aed' : '#2a2a4a'}`,
    borderRadius: 8,
    color: '#e8e8f0',
    cursor: 'pointer',
    textTransform: 'capitalize',
    fontWeight: selected ? 700 : 400,
  }),
  modeRow: { display: 'flex', gap: 8 },
  modeBtn: (selected) => ({
    flex: 1,
    padding: '8px 0',
    background: selected ? '#16213e' : 'transparent',
    border: `1px solid ${selected ? '#6366f1' : '#2a2a4a'}`,
    borderRadius: 8,
    color: selected ? '#a5b4fc' : '#666',
    cursor: 'pointer',
    fontSize: 13,
  }),
  error: { color: '#f87171', fontSize: 13 },
  label: { color: '#888', fontSize: 13, marginBottom: -8 },
  divider: { borderTop: '1px solid #1e1e3a', margin: '4px 0' },
  roomInput: { display: 'flex', gap: 8 },
};

export function Login() {
  const { setUser, setRoom, setPhase } = useGameStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [petSpecies, setPetSpecies] = useState('cat');
  const [mode, setMode] = useState('casual');
  const [stakeAmount, setStakeAmount] = useState('0.1');
  const [roomCode, setRoomCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleCreateRoom() {
    if (!username.trim()) return setError('Username required');
    setLoading(true);
    setError('');
    try {
      // TODO: replace with real auth endpoint
      const user = { userId: username, username, petSpecies, petLevel: 1, petXP: 0 };
      setUser(user);

      connectSocket();
      // Wait for socket to be connected before emitting
      await new Promise((res) => {
        if (socket.connected) return res();
        socket.once('connect', res);
      });

      socket.emit('create_room', {
        userId: username,
        username,
        mode,
        stakeAmount: mode === 'locked-in' ? parseFloat(stakeAmount) * 1e9 : 0,
      });
      // room_created event handled in useSocket → sets phase to 'waiting'
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleJoinRoom() {
    if (!username.trim()) return setError('Username required');
    if (!roomCode.trim()) return setError('Room code required');
    setLoading(true);
    setError('');
    try {
      const user = { userId: username, username, petSpecies, petLevel: 1, petXP: 0 };
      setUser(user);

      connectSocket();
      await new Promise((res) => {
        if (socket.connected) return res();
        socket.once('connect', res);
      });

      socket.emit('join_room', { roomCode: roomCode.toUpperCase(), userId: username, username });
      // room_update event handled in useSocket
      setPhase('waiting');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.root}>
      <div style={styles.title}>BUDDY: LOCK IN</div>
      <div style={styles.tagline}>If you lose focus, your money's on the line.</div>

      <div style={styles.card}>
        <span style={styles.label}>Username</span>
        <input
          style={styles.input}
          placeholder="your_name"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />

        <span style={styles.label}>Pick your pet</span>
        <div style={styles.row}>
          {PET_SPECIES.map((s) => (
            <button key={s} style={styles.petBtn(petSpecies === s)} onClick={() => setPetSpecies(s)}>
              {s === 'cat' ? '🐱' : s === 'dog' ? '🐶' : '🦉'} {s}
            </button>
          ))}
        </div>

        <div style={styles.divider} />

        <span style={styles.label}>Mode</span>
        <div style={styles.modeRow}>
          <button style={styles.modeBtn(mode === 'casual')} onClick={() => setMode('casual')}>
            Casual (no stakes)
          </button>
          <button style={styles.modeBtn(mode === 'locked-in')} onClick={() => setMode('locked-in')}>
            Locked In (SOL)
          </button>
        </div>

        {mode === 'locked-in' && (
          <input
            style={styles.input}
            type="number"
            step="0.01"
            min="0.01"
            placeholder="Stake (SOL)"
            value={stakeAmount}
            onChange={(e) => setStakeAmount(e.target.value)}
          />
        )}

        {error && <div style={styles.error}>{error}</div>}

        <button style={styles.btn} onClick={handleCreateRoom} disabled={loading}>
          {loading ? 'Creating...' : 'Create Room'}
        </button>

        <div style={styles.divider} />

        <span style={styles.label}>Or join existing room</span>
        <div style={styles.roomInput}>
          <input
            style={{ ...styles.input, flex: 1 }}
            placeholder="Room code"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            maxLength={6}
          />
          <button style={{ ...styles.btn, padding: '0 20px' }} onClick={handleJoinRoom} disabled={loading}>
            Join
          </button>
        </div>
      </div>
    </div>
  );
}
