import { io } from 'socket.io-client';

// Use the same origin as the page so the socket goes through Vite's proxy.
// This avoids mixed-content blocks when the client is served over HTTPS.
const SERVER_URL = import.meta.env.VITE_SERVER_URL || window.location.origin;

// Singleton socket — created once and reused across the app
export const socket = io(SERVER_URL, {
  autoConnect: false,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

export function connectSocket() {
  if (!socket.connected) socket.connect();
}

export function disconnectSocket() {
  if (socket.connected) socket.disconnect();
}
