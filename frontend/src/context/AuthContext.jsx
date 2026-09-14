/**
 * Look Out! — auth context.
 *
 * The whole app reads the session from here: who is signed in, which role tab
 * they belong to, and which plate numbers (drivers) they own.
 *
 * Three states are possible:
 *   • ready && !session           → show the Login / Signup screen
 *   • ready && profile.role       → the dashboard, pre-seeded to that role
 *   • !firebaseReady && demo      → DEMO MODE (no accounts, local session only)
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  createProfile,
  firebaseReady,
  fetchProfile,
  loginAccount,
  logoutAccount,
  profileFromUser,
  signUpAccount,
  updateProfileFields,
  watchAuthState,
  watchProfile,
} from '../services/authService.js';

const AuthContext = createContext(null);

const DEMO_KEY = 'lookout.demoSession';
const ROLE_KEY = (uid) => `lookout.role.${uid}`;

const readDemo = () => {
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeDemo = (value) => {
  try {
    if (value) localStorage.setItem(DEMO_KEY, JSON.stringify(value));
    else localStorage.removeItem(DEMO_KEY);
  } catch {
    /* private browsing — ignore */
  }
};

const readStoredRole = (uid) => {
  try {
    return localStorage.getItem(ROLE_KEY(uid));
  } catch {
    return null;
  }
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [demo, setDemo] = useState(() => (firebaseReady ? null : readDemo()));
  const [requestedRole, setRequestedRole] = useState(null);
  const [ready, setReady] = useState(!firebaseReady);
  const [profileError, setProfileError] = useState('');

  /* ---- Firebase auth state ---- */
  useEffect(() => {
    if (!firebaseReady) return undefined;
    return watchAuthState((nextUser) => {
      setUser(nextUser);
      if (!nextUser) {
        setProfile(null);
        setProfileError('');
      } else {
        setRequestedRole((prev) => prev ?? readStoredRole(nextUser.uid));
      }
      setReady(true);
    });
  }, []);

  /* ---- Profile document (live) ---- */
  useEffect(() => {
    if (!firebaseReady || !user) return undefined;
    return watchProfile(
      user.uid,
      (docSnap) => {
        setProfileError('');
        if (docSnap) {
          // Hand-made documents sometimes lack `role`; normalise it so the UI
          // never sees an undefined role (that used to strand the user on the
          // login screen / make App's view-guard flip from tab to tab).
          setProfile(
            docSnap.role
              ? docSnap
              : { ...docSnap, role: requestedRole ?? readStoredRole(user.uid) ?? 'commuter' },
          );
          return;
        }
        // Missing document (rules blocked the read, or an account made by hand).
        const role = requestedRole ?? readStoredRole(user.uid) ?? 'commuter';
        setProfile((prev) => prev ?? profileFromUser(user, role));
      },
      (err) => {
        console.warn('[Look Out!] Live profile subscription failed:', err);
        setProfileError(
          'Could not read your profile from Firestore — publish the rules in /firestore.rules.',
        );
        setProfile((prev) =>
          prev ?? profileFromUser(user, requestedRole ?? readStoredRole(user.uid) ?? 'commuter'),
        );
      },
    );
  }, [user, requestedRole]);

  const rememberRole = useCallback((uid, role) => {
    setRequestedRole(role);
    try {
      localStorage.setItem(ROLE_KEY(uid), role);
    } catch {
      /* ignore */
    }
  }, []);

  /* -------------------------------- actions ------------------------------- */

  const signIn = useCallback(
    async ({ role, email, password }) => {
      const { user: nextUser, profile: nextProfile } = await loginAccount({
        role,
        email,
        password,
      });
      rememberRole(nextUser.uid, nextProfile?.role ?? role);
      setProfile(nextProfile);
      setUser(nextUser);
      return nextProfile;
    },
    [rememberRole],
  );

  const signUp = useCallback(
    async ({ role, fullName, email, phone, password, plate }) => {
      const { user: nextUser, profile: nextProfile } = await signUpAccount({
        role,
        fullName,
        email,
        phone,
        password,
        plate,
      });
      rememberRole(nextUser.uid, role);
      setProfile(nextProfile);
      setUser(nextUser);
      return nextProfile;
    },
    [rememberRole],
  );

  const signOut = useCallback(async () => {
    try {
      if (firebaseReady) await logoutAccount();
    } finally {
      setUser(null);
      setProfile(null);
      setDemo(null);
      setRequestedRole(null);
      writeDemo(null);
    }
  }, []);

  /** DEMO MODE: no Firebase config pasted yet — explore the dashboard locally. */
  const enterDemo = useCallback((role) => {
    const session = {
      role,
      uid: `demo-${role}`,
      fullName:
        role === 'driver'
          ? 'Demo Driver'
          : role === 'admin'
            ? 'Demo Admin'
            : 'Demo Commuter',
      email: `${role}@lookout.demo`,
      phone: '',
      plates: role === 'driver' ? ['DEMO-01'] : [],
      activePlate: role === 'driver' ? 'DEMO-01' : '',
      demo: true,
    };
    writeDemo(session);
    setDemo(session);
  }, []);

  const leaveDemo = useCallback(() => {
    writeDemo(null);
    setDemo(null);
  }, []);

  /* ------------------------------- derived -------------------------------- */

  const activeProfile = useMemo(() => {
    if (demo) return demo;
    if (profile) return profile;
    if (user) return profileFromUser(user, requestedRole ?? readStoredRole(user.uid) ?? 'commuter');
    return null;
  }, [demo, profile, user, requestedRole]);

  const setPlates = useCallback(
    async (nextPlates) => {
      const plates = Array.isArray(nextPlates) ? nextPlates : [];
      const activePlate =
        plates.includes(activeProfile?.activePlate) ? activeProfile.activePlate : plates[0] ?? '';

      if (demo) {
        const next = { ...demo, plates, activePlate };
        writeDemo(next);
        setDemo(next);
        return;
      }
      if (!user) return;
      setProfile((prev) => ({ ...prev, plates, activePlate }));
      await updateProfileFields(user.uid, { plates, activePlate });
    },
    [demo, user, activeProfile],
  );

  const setActivePlate = useCallback(
    async (plate) => {
      if (demo) {
        const next = { ...demo, activePlate: plate };
        writeDemo(next);
        setDemo(next);
        return;
      }
      if (!user) return;
      setProfile((prev) => ({ ...prev, activePlate: plate }));
      await updateProfileFields(user.uid, { activePlate: plate });
    },
    [demo, user],
  );

  const updateDetails = useCallback(
    async (patch) => {
      if (demo) {
        const next = { ...demo, ...patch };
        writeDemo(next);
        setDemo(next);
        return;
      }
      if (!user) return;
      setProfile((prev) => ({ ...prev, ...patch }));
      await updateProfileFields(user.uid, patch);
    },
    [demo, user],
  );

  // Role can never be undefined here: legacy/hand-made profiles without a
  // `role` field fall back to the remembered login tab, then to 'commuter'.
  // A null role only happens while actually signed out (user == null).
  const role =
    demo?.role ||
    profile?.role ||
    requestedRole ||
    (user ? readStoredRole(user.uid) : null) ||
    (user ? 'commuter' : null);
  // Admins roam freely; everyone else is locked to their own side of the app.
  const isAdmin = role === 'admin';

  const value = useMemo(
    () => ({
      ready,
      user,
      profile: activeProfile,
      role,
      isAdmin,
      canViewCommuter: role === 'commuter' || isAdmin,
      canViewDriver: role === 'driver' || isAdmin,
      plates: activeProfile?.plates ?? [],
      activePlate: activeProfile?.activePlate ?? '',
      isDemo: Boolean(demo),
      firebaseMissing: !firebaseReady,
      profileError,
      signIn,
      signUp,
      signOut,
      enterDemo,
      leaveDemo,
      setPlates,
      setActivePlate,
      updateDetails,
      /** Legacy escape hatch used by the login screen for the "no profile" case. */
      createProfile: async (uid, patch) => createProfile(uid, patch),
      fetchProfile,
    }),
    [
      ready,
      role,
      isAdmin,
      user,
      activeProfile,
      demo,
      profileError,
      signIn,
      signUp,
      signOut,
      enterDemo,
      leaveDemo,
      setPlates,
      setActivePlate,
      updateDetails,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth() must be used inside <AuthProvider>.');
  return ctx;
}
