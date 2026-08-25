import { io } from 'socket.io-client';

/**
 * Single shared Socket.IO connection used by the whole app
 * (fleet state lives in App.jsx so switching tabs never loses vehicles).
 *
 * Backend base URL resolution order:
 *   1. VITE_BACKEND_URL build-time env var
 *      - Cloudflare Pages: set it in the Pages dashboard (Production + Preview)
 *      - Local development: frontend/.env.local -> http://localhost:4000
 *   2. Fallback: the deployed Render instance, so the pushed repo works
 *      out of the box in production.
 *
 * Trailing slashes are stripped so requests never turn into "//api/routes"
 * (a double slash makes Express answer 404).
 */
const CONFIGURED_URL =
  import.meta.env.VITE_BACKEND_URL?.trim() || 'https://lookout-p8fw.onrender.com';

export const BACKEND_URL = CONFIGURED_URL.replace(/\/+$/, '');

export const socket = io(BACKEND_URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionDelayMax: 5000,
  // WebSocket first, long-polling fallback — survives restrictive proxies.
  transports: ['websocket', 'polling'],
});
