/**
 * Look Out! — admin data layer.
 *
 * Everything here is only reachable when the signed-in profile has
 * `role: 'admin'`; /firestore.rules enforces the same on the server side, so a
 * curious commuter hitting these functions directly just gets `permission-denied`.
 *
 * Note on deletion: Firebase Auth does not let one client delete ANOTHER
 * user's login credential — that needs the Admin SDK. Deleting here removes the
 * Firestore profile (the user disappears from Look Out! and can no longer be
 * tracked), and the console reminds you to remove the credential in Firebase.
 */

import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { db, firebaseReady } from './firebase.js';

const toMillis = (value) => {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return 0;
};

/** Live list of every account (commuters, drivers, admins). */
export function watchAllUsers(onNext, onError) {
  if (!firebaseReady) return () => {};
  return onSnapshot(
    collection(db, 'users'),
    (snap) => {
      const users = snap.docs
        .map((entry) => ({ uid: entry.id, ...entry.data() }))
        .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      onNext(users);
    },
    (err) => onError?.(err),
  );
}

/** Live list of the most recent pokes across the whole fleet. */
export function watchAllPokes(onNext, onError, max = 60) {
  if (!firebaseReady) return () => {};
  return onSnapshot(
    query(collection(db, 'pokes'), limit(max)),
    (snap) => {
      const list = snap.docs
        .map((entry) => ({ id: entry.id, ...entry.data() }))
        .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      onNext(list);
    },
    (err) => onError?.(err),
  );
}

/** Admin edit of somebody else's profile (name, phone, role, plates…). */
export async function adminUpdateUser(uid, patch) {
  if (!firebaseReady) throw new Error('Firebase is not configured yet.');
  await setDoc(doc(db, 'users', uid), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
}

/** Remove an account's Look Out! profile. */
export async function adminDeleteUser(uid) {
  if (!firebaseReady) throw new Error('Firebase is not configured yet.');
  await deleteDoc(doc(db, 'users', uid));
}

export { toMillis };
