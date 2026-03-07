import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useGameStore } from './store/gameStore.js';
import { useSocket } from './hooks/useSocket.js';
import { Login } from './components/auth/Login.jsx';
import { WaitingRoom } from './components/ui/WaitingRoom.jsx';
import { StudySession } from './components/scene/StudySession.jsx';
import { RecapScreen } from './components/ui/RecapScreen.jsx';
import { LeaderboardScreen } from './components/ui/Leaderboard.jsx';

function AppRoutes() {
  const phase = useGameStore((s) => s.phase);
  useSocket(); // mount socket listeners for the lifetime of the app

  // Phase-driven navigation — keeps URL in sync with game state
  if (phase === 'login') return <Login />;
  if (phase === 'waiting') return <WaitingRoom />;
  if (phase === 'session') return <StudySession />;
  if (phase === 'recap') return <RecapScreen />;

  return <Login />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/*" element={<AppRoutes />} />
        <Route path="/leaderboard" element={<LeaderboardScreen />} />
      </Routes>
    </BrowserRouter>
  );
}
