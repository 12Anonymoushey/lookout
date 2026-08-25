import { io } from 'socket.io-client';

/**
 * Single shared Socket.IO connection used by the whole app
 * (fleet state lives in App.jsx so switching tabs never loses vehicles).
 *
 * Override the target server with VITE_BACKEND_URL — see .env.example.
 */
export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:4000';

export const socket = io(BACKEND_URL, {
  autoConnect: true,
  reconnectionDelayMax: 5000,
});
