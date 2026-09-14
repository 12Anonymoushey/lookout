/**
 * Look Out! — account layer.
 *
 * Auth        : Firebase Authentication (email + password)
 * Database    : Cloud Firestore  →  `users/{uid}` profile documents
 *
 * Profile document shape
 * {
 *   uid, role: 'commuter' | 'driver', fullName, email, phone,
 *   plates: string[],        // driver fleet — managed from the Driver console
 *   activePlate: string,     // the plate currently "on air"
 *   createdAt, updatedAt
 * }
 */

import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { auth, db, firebaseReady, isFirebaseConfigured } from './firebase.js';

export { firebaseReady, isFirebaseConfigured };

export const ROLES = ['commuter', 'driver', 'admin'];

/**
 * THE ADMIN ACCOUNT(S) — keep in sync with the `isAdminEmail()` helper inside
 * /firestore.rules, which uses the same address to allow self-promotion.
 *
 * Whoever signs up (or logs in) with one of these emails gets the `admin` role:
 * they can log in through EITHER the Commuter or the Driver tab, switch between
 * both views, and manage every commuter/driver record.
 */
export const ADMIN_EMAILS = ['joshrika@gmail.com'];

export const isAdminEmail = (email) =>
  ADMIN_EMAILS.includes(String(email ?? '').trim().toLowerCase());

export const ROLE_META = {
  commuter: {
    id: 'commuter',
    label: 'Commuter',
    blurb: 'Ride smarter — track live jeepneys and poke the driver when you board.',
  },
  driver: {
    id: 'driver',
    label: 'Driver',
    blurb: 'Go on air — share your GPS, manage your plates and answer pokes.',
  },
  admin: {
    id: 'admin',
    label: 'Admin',
    blurb: 'Manage commuters and drivers, then switch between both views.',
  },
};

/* ------------------------------- validation ------------------------------ */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** PUV plates read best upper-case: "BMS 1930", "JEEP-102", "FBC-1234". */
export function normalizePlate(value) {
  return String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9 -]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12);
}

export function isValidPlate(value) {
  const plate = normalizePlate(value);
  return plate.length >= 3 && /[A-Z0-9]/.test(plate);
}

export function normalizePhone(value) {
  return String(value ?? '').replace(/[^\d+]/g, '').slice(0, 13);
}

/** Human message for every Firebase Auth error code we realistically hit. */
export function friendlyAuthError(err) {
  const code = err?.code ?? '';
  const map = {
    'auth/email-already-in-use': 'That email is already registered. Try logging in instead.',
    'auth/invalid-email': 'That email address looks malformed.',
    'auth/weak-password': 'Passwords must be at least 6 characters long.',
    'auth/missing-password': 'Please enter your password.',
    'auth/user-not-found': 'No account uses that email yet — sign up first.',
    'auth/wrong-password': 'Incorrect password. Please try again.',
    'auth/invalid-credential':
      'Email or password is incorrect (or the account no longer exists).',
    'auth/too-many-requests': 'Too many attempts. Wait a minute, then try again.',
    'auth/network-request-failed': 'Network problem — check your internet connection.',
    'auth/operation-not-allowed':
      'Email/Password sign-in is disabled in Firebase. Enable it in Authentication → Sign-in method.',
    'auth/unauthorized-domain':
      'This domain is not authorised in Firebase Authentication → Settings → Authorized domains.',
    'permission-denied':
      'Firestore rejected the write. Publish the rules from /firestore.rules in the repo root.',
    'unavailable': 'Cannot reach Firestore. Check your connection and try again.',
  };
  return (
    map[code] ||
    err?.message ||
    'Something went wrong. Please try again.'
  );
}

/* --------------------------------- reads --------------------------------- */

/** Build a usable profile object from the Auth user (fallback when no doc yet). */
export function profileFromUser(user, role) {
  if (!user) return null;
  return {
    uid: user.uid,
    role,
    fullName: user.displayName || user.email?.split('@')[0] || 'Look Out! user',
    email: user.email ?? '',
    phone: '',
    plates: [],
    activePlate: '',
    createdAt: null,
    updatedAt: null,
  };
}

export async function fetchProfile(uid) {
  if (!firebaseReady || !uid) return null;
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

/** Live profile subscription — keeps plates/counters in sync across devices. */
export function watchProfile(uid, onNext, onError) {
  if (!firebaseReady || !uid) return () => {};
  return onSnapshot(
    doc(db, 'users', uid),
    (snap) => onNext(snap.exists() ? { uid, ...snap.data() } : null),
    (err) => onError?.(err),
  );
}

/** Auth-state subscription (wraps Firebase so callers never import the SDK). */
export function watchAuthState(onNext) {
  if (!firebaseReady) {
    onNext(null);
    return () => {};
  }
  return onAuthStateChanged(auth, onNext);
}

/* -------------------------------- writes --------------------------------- */

export async function createProfile(uid, patch) {
  if (!firebaseReady) return null;
  const payload = { ...patch, updatedAt: serverTimestamp() };
  await setDoc(doc(db, 'users', uid), payload, { merge: true });
  return payload;
}

export async function updateProfileFields(uid, patch) {
  if (!firebaseReady || !uid) return;
  await setDoc(
    doc(db, 'users', uid),
    { ...patch, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/* -------------------------------- actions -------------------------------- */

/**
 * Register a commuter or driver.
 * @returns {{ user, profile }}
 */
export async function signUpAccount({
  role,
  fullName,
  email,
  phone,
  password,
  plate,
}) {
  if (!firebaseReady) throw new Error('Firebase is not configured yet.');
  if (!ROLES.includes(role)) throw new Error('Pick either Commuter or Driver.');

  const cleanEmail = email.trim().toLowerCase();
  // The admin email silently becomes an admin whichever tab was used.
  const effectiveRole = isAdminEmail(cleanEmail) ? 'admin' : role;
  const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
  const uid = cred.user.uid;

  try {
    await updateProfile(cred.user, { displayName: fullName.trim() });
  } catch {
    /* display name is cosmetic — never block the signup on it */
  }

  const plates = effectiveRole === 'driver' && plate && isValidPlate(plate)
    ? [normalizePlate(plate)]
    : [];

  const profile = {
    uid,
    role: effectiveRole,
    loginTab: role,
    fullName: fullName.trim(),
    email: cleanEmail,
    phone: normalizePhone(phone),
    plates,
    activePlate: plates[0] ?? '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'users', uid), profile);
  } catch (err) {
    // Account exists but the profile write failed (often Firestore rules).
    console.error('[Look Out!] Could not write the profile document:', err);
    throw new Error(
      'Account created, but saving your profile failed — check your Firestore rules (/firestore.rules).',
    );
  }

  return { user: cred.user, profile };
}

/**
 * Log in and make sure the account really belongs to the selected tab.
 * A driver signing in on the Commuter tab (or vice-versa) is rejected loudly —
 * silently mismatching roles is the classic source of "my plates are gone" bugs.
 */
export async function loginAccount({ role, email, password }) {
  if (!firebaseReady) throw new Error('Firebase is not configured yet.');

  const cleanEmail = email.trim().toLowerCase();
  const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
  const uid = cred.user.uid;
  const admin = isAdminEmail(cleanEmail);

  let profile = null;
  try {
    profile = await fetchProfile(uid);
  } catch (err) {
    console.warn('[Look Out!] Profile read failed, continuing with auth data:', err);
  }

  const accountRole = profile?.role;

  // Admins may use either tab; everyone else must match their own role.
  if (accountRole && accountRole !== role && !admin) {
    await signOut(auth);
    throw new Error(
      `That account is registered as a ${accountRole}. Switch to the ${accountRole} tab to log in.`,
    );
  }

  // Legacy/hand-made account without a profile document — self-heal it.
  if (!profile) {
    profile = profileFromUser(cred.user, admin ? 'admin' : role);
    try {
      await createProfile(uid, {
        uid,
        role: admin ? 'admin' : role,
        fullName: profile.fullName,
        email: profile.email,
        phone: '',
        plates: [],
        activePlate: '',
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn('[Look Out!] Could not self-heal the profile document:', err);
    }
  } else if (admin && accountRole !== 'admin') {
    // A pre-existing admin address that was created before this feature.
    try {
      await updateProfileFields(uid, { role: 'admin' });
      profile = { ...profile, role: 'admin' };
    } catch (err) {
      console.warn('[Look Out!] Could not promote the admin profile:', err);
    }
  }

  return { user: cred.user, profile };
}

/** Human labels for a role value coming out of Firestore. */
export function roleLabel(role) {
  return ROLE_META[role]?.label ?? 'Commuter';
}

export async function logoutAccount() {
  if (!firebaseReady) return;
  await signOut(auth);
}
