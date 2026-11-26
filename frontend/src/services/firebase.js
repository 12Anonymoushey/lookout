import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: "AIzaSyCIJX5WKPzb0bXQ0-3-rsIGsKavX75idps",
  authDomain: "lookout-37180.firebaseapp.com",
  projectId: "lookout-37180",
  storageBucket: "lookout-37180.firebasestorage.app",
  messagingSenderId: "782818241515",
  appId: "1:782818241515:web:81ec4ded641785c24707ae",
  measurementId: "G-J9WTCWJ5VC"
};

/** A value counts as "filled in" only when it is non-empty and not a placeholder. */
const isRealValue = (value) =>
  typeof value === 'string' && value.trim() !== '' && !/^PASTE_/i.test(value.trim());

/** Required keys — if any is still a placeholder we cannot touch Firebase at all. */
const REQUIRED_KEYS = ['apiKey', 'authDomain', 'projectId', 'appId'];

export const isFirebaseConfigured = REQUIRED_KEYS.every((key) =>
  isRealValue(firebaseConfig[key]),
);

let app = null;
let auth = null;
let db = null;

if (isFirebaseConfigured) {
  try {
    // Guard against React Fast Refresh / HMR calling initializeApp twice.
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (err) {
    // A malformed config must not white-screen the whole app.
    console.error('[Look Out!] Firebase failed to initialise:', err);
    app = null;
    auth = null;
    db = null;
  }
}

/** True only when the config is filled in AND the SDK initialised cleanly. */
export const firebaseReady = Boolean(auth && db);

export { app, auth, db };
export default app;
