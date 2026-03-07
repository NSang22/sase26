import { useEffect, useState } from 'react';
import axios from 'axios';

const s = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    minHeight: '100vh',
    padding: '48px 24px',
    gap: 24,
    background: 'linear-gradient(135deg, #0a0a18 0%, #12122a 100%)',
  },
  title: { fontSize: 32, fontWeight: 900, color: '#a78bfa', letterSpacing: 2 },
  table: {
    width: '100%',
    maxWidth: 680,
    borderCollapse: 'collapse',
  },
  th: {
    padding: '10px 16px',
    color: '#666',
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase',
    borderBottom: '1px solid #1e1e3a',
    textAlign: 'left',
  },
  tr: (i) => ({
    background: i % 2 === 0 ? '#0d0d1f' : '#0a0a18',
    transition: 'background 0.15s',
  }),
  td: {
    padding: '12px 16px',
    color: '#e8e8f0',
    fontSize: 14,
    borderBottom: '1px solid #1a1a2e',
  },
  rank: (i) => ({
    fontWeight: 900,
    fontSize: 16,
    color: i === 0 ? '#facc15' : i === 1 ? '#94a3b8' : i === 2 ? '#cd7c2b' : '#444',
  }),
  bar: (pct) => ({
    display: 'inline-block',
    width: `${Math.round(pct * 80)}px`,
    height: 6,
    background: '#7c3aed',
    borderRadius: 3,
    verticalAlign: 'middle',
    marginRight: 8,
  }),
  pet: { fontSize: 18 },
  loading: { color: '#555', fontSize: 16 },
};

const petEmoji = { cat: '🐱', dog: '🐶', owl: '🦉' };

export function LeaderboardScreen() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('/api/leaderboard')
      .then((r) => setEntries(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={s.root}>
      <div style={s.title}>Leaderboard</div>

      {loading ? (
        <div style={s.loading}>Loading...</div>
      ) : (
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>#</th>
              <th style={s.th}>Player</th>
              <th style={s.th}>Focus time</th>
              <th style={s.th}>Win rate</th>
              <th style={s.th}>Sessions</th>
              <th style={s.th}>Streak</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={e.userId} style={s.tr(i)}>
                <td style={s.td}>
                  <span style={s.rank(i)}>{i + 1}</span>
                </td>
                <td style={s.td}>
                  <span style={s.pet}>{petEmoji[e.petSpecies] ?? '🐾'}</span>{' '}
                  <strong>{e.username}</strong>
                  <span style={{ color: '#4c1d95', fontSize: 12, marginLeft: 6 }}>
                    Lv.{e.petLevel}
                  </span>
                </td>
                <td style={s.td}>{Math.round(e.totalFocusTime)}m</td>
                <td style={s.td}>
                  <span style={s.bar(e.winRate)} />
                  {(e.winRate * 100).toFixed(0)}%
                </td>
                <td style={s.td}>{e.totalSessions}</td>
                <td style={s.td}>{e.currentStreak} 🔥</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td style={{ ...s.td, color: '#555' }} colSpan={6}>
                  No sessions yet. Be the first to lock in.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
