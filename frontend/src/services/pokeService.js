/**
 * Look Out! — Poke layer.
 *
 * A commuter taps the jeepney that is about to reach her and "pokes" it.
 * The tap has to travel from her phone to the driver's console, so there are
 * two transports behind one API:
 *
 *   1. Firebase Firestore  (preferred, when configured + signed in)
 *      `pokes/{id}`        → the poke log (history, who/where/when)
 *      `pokeCounts/{plate}`→ running total per jeepney (cheap to subscribe)
 *
 *   2. Socket.IO fallback  (demo mode / Firestore unreachable)
 *      The realtime backend keeps an in-memory log and replays it to any
 *      driver that connects later, so the counter still works offline.
 *
 * Callers only ever touch sendPoke() and subscribeDriverPokes().
 */

import {
  addDoc,
  collection,
  doc,
  increment,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { auth, db, firebaseReady } from './firebase.js';
import { socket } from './socket.js';

/** Quick notes a commuter can attach to a poke. */
export const POKE_PRESETS = [
  { id: 'poke', label: 'Poke! 👋', message: 'Poke! 👋' },
  { id: 'here', label: "I'm at the stop", message: "I'm at the stop — please don't pass me." },
  { id: 'wait', label: 'Wait please', message: 'Please wait a moment, I am running to you.' },
];

const RECENT_LIMIT = 50;

const useFirestore = () => firebaseReady && Boolean(auth?.currentUser);

/* ------------------------- Socket.IO local cache ------------------------- */
/**
 * The backend replays its whole poke log on every connection (`pokeLog`) and
 * pushes each new poke as `pokeReceived`.
 *
 * The cache is deliberately module-level and updated even when no driver
 * console is mounted: a poke that arrives while the driver is browsing the
 * commuter tab (or sits in the login screen) must still be counted the moment
 * she switches back.
 */
let socketLog = {}; // { [plate]: { count, recent: [poke, ...] } }
const cacheListeners = new Set();

const notifyCache = () => {
  for (const listener of cacheListeners) listener();
};

socket.on('pokeLog', (log) => {
  if (log && typeof log === 'object') socketLog = log;
  notifyCache();
});

socket.on('pokeReceived', ({ toPlate, count, poke } = {}) => {
  const plate = String(toPlate ?? '').trim().toUpperCase();
  if (!plate) return;
  const entry = socketLog[plate] ?? { count: 0, recent: [] };
  socketLog[plate] = {
    count: Number.isFinite(count) ? count : (Number(entry.count) || 0) + 1,
    recent: poke
      ? [
          { id: `sock-${poke.createdAt}-${Math.random().toString(36).slice(2, 7)}`, ...poke },
          ...(entry.recent ?? []),
        ].slice(0, RECENT_LIMIT)
      : entry.recent ?? [],
  };
  notifyCache();
});

/* --------------------------------- send --------------------------------- */

/**
 * Poke a jeepney.
 * @param {{ toPlate: string, fromName?: string, message?: string, lat?: number,
 *           lng?: number, routeId?: string|null }} poke
 * @returns {Promise<'firestore'|'socket'>} which transport actually carried it
 */
export async function sendPoke({
  toPlate,
  fromName = 'A commuter',
  message = 'Poke! 👋',
  lat = null,
  lng = null,
  routeId = null,
}) {
  const plate = String(toPlate ?? '').trim().toUpperCase();
  if (!plate) throw new Error('No jeepney selected.');

  if (useFirestore()) {
    try {
      await addDoc(collection(db, 'pokes'), {
        toPlate: plate,
        fromUid: auth.currentUser.uid,
        fromName,
        message,
        lat,
        lng,
        routeId,
        createdAt: serverTimestamp(),
      });
      await setDoc(
        doc(db, 'pokeCounts', plate),
        { count: increment(1), updatedAt: serverTimestamp() },
        { merge: true },
      );
      return 'firestore';
    } catch (err) {
      // Rules not published yet? Fall back so the demo never dead-ends.
      console.warn('[Look Out!] Firestore poke failed, using the realtime server:', err);
    }
  }

  socket.emit('poke', { toPlate: plate, fromName, message, lat, lng, routeId });
  return 'socket';
}

/* ------------------------------ driver feed ------------------------------ */

/**
 * Subscribe to a plate's poke feed.
 * @param {string} plate
 * @param {(state: { count: number, list: object[], source: string }) => void} onUpdate
 * @returns {() => void} unsubscribe
 */
export function subscribeDriverPokes(plate, onUpdate) {
  const key = String(plate ?? '').trim().toUpperCase();
  if (!key) return () => {};

  if (useFirestore()) {
    let count = 0;
    let list = [];

    const push = (source) => onUpdate({ count, list, source });

    const stopCount = onSnapshot(
      doc(db, 'pokeCounts', key),
      (snap) => {
        count = snap.exists() ? Number(snap.data().count) || 0 : 0;
        push('firestore');
      },
      (err) => console.warn('[Look Out!] poke counter listener failed:', err),
    );

    // Equality-only filter (no orderBy) so the project needs no composite index.
    const stopList = onSnapshot(
      query(collection(db, 'pokes'), where('toPlate', '==', key), limit(RECENT_LIMIT)),
      (snap) => {
        list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => millis(b.createdAt) - millis(a.createdAt));
        push('firestore');
      },
      (err) => console.warn('[Look Out!] poke log listener failed:', err),
    );

    return () => {
      stopCount();
      stopList();
    };
  }

  // ---- Socket.IO fallback: read straight from the shared cache ----
  const emit = () => {
    const entry = socketLog[key] ?? { count: 0, recent: [] };
    onUpdate({
      count: Number(entry.count) || 0,
      list: Array.isArray(entry.recent) ? entry.recent : [],
      source: 'socket',
    });
  };

  emit(); // paint cached values immediately
  cacheListeners.add(emit);
  socket.on('connect', emit);
  return () => {
    cacheListeners.delete(emit);
    socket.off('connect', emit);
  };
}

/** Firestore Timestamp | number | Date | null → epoch millis (for sorting). */
function millis(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return 0;
}

/** Pretty "2 min ago" for the poke feed. */
export function timeAgo(value) {
  const ms = millis(value) || Date.now();
  const secs = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (secs < 45) return 'just now';
  if (secs < 3600) return `${Math.round(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)} h ago`;
  return `${Math.round(secs / 86400)} d ago`;
}
