import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bus,
  Check,
  CreditCard,
  Hand,
  Loader2,
  Pencil,
  Radio,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import AppShell, { InfoRow, Section } from './AppShell.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { adminDeleteUser, adminUpdateUser, toMillis, watchAllPokes, watchAllUsers } from '../services/adminService.js';
import { firebaseReady, normalizePhone, normalizePlate } from '../services/authService.js';
import { timeAgo } from '../services/pokeService.js';
import { statusMeta } from '../utils/vehicle.js';

const ROLE_STYLES = {
  commuter: 'bg-cyan-500/15 text-cyan-300',
  driver: 'bg-blue-500/15 text-blue-300',
  admin: 'bg-violet-500/15 text-violet-300',
};

const ROLE_ICONS = { commuter: Users, driver: Bus, admin: ShieldCheck };

const emptyDraft = { fullName: '', phone: '', role: 'commuter', plates: '', activePlate: '' };

/**
 * ADMIN CONSOLE
 * Only reachable with `role: 'admin'` (enforced in /firestore.rules too).
 * Left panel → live fleet, poke feed and counters.
 * Stage      → full CRUD over every commuter / driver account.
 */
export default function AdminView({ vehicles = [], onCloseDrawer, drawerOpen, collapsed, onToggleCollapse }) {
  const { profile } = useAuth();

  const [users, setUsers] = useState([]);
  const [pokes, setPokes] = useState([]);
  const [loading, setLoading] = useState(firebaseReady);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [editing, setEditing] = useState(null); // { uid, ... }
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [confirmUid, setConfirmUid] = useState('');
  const [toast, setToast] = useState('');

  /* ------------------------------ live data ------------------------------ */
  useEffect(() => {
    if (!firebaseReady) {
      setLoading(false);
      return undefined;
    }
    return watchAllUsers(
      (list) => {
        setUsers(list);
        setError('');
        setLoading(false);
      },
      (err) => {
        console.warn('[Look Out!] admin user list failed:', err);
        setError(
          err?.code === 'permission-denied'
            ? 'Firestore refused to list accounts — publish the rules in /firestore.rules so admins can read every profile.'
            : (err?.message ?? 'Could not load accounts.'),
        );
        setLoading(false);
      },
    );
  }, []);

  useEffect(() => {
    if (!firebaseReady) return undefined;
    return watchAllPokes(setPokes, (err) =>
      console.warn('[Look Out!] admin poke feed failed:', err),
    );
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  /* ------------------------------- derived ------------------------------- */
  const counts = useMemo(() => {
    const base = { commuter: 0, driver: 0, admin: 0 };
    for (const user of users) base[user.role] = (base[user.role] ?? 0) + 1;
    return base;
  }, [users]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return users.filter((user) => {
      if (roleFilter !== 'all' && user.role !== roleFilter) return false;
      if (!needle) return true;
      return [
        user.fullName,
        user.email,
        user.phone,
        ...(user.plates ?? []),
      ]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle));
    });
  }, [users, search, roleFilter]);

  /* ------------------------------- actions ------------------------------- */
  const openEditor = (user) => {
    setEditing(user);
    setConfirmUid('');
    setDraft({
      fullName: user.fullName ?? '',
      phone: user.phone ?? '',
      role: user.role ?? 'commuter',
      plates: (user.plates ?? []).join(', '),
      activePlate: user.activePlate ?? '',
    });
  };

  const saveEditor = async () => {
    if (!editing) return;
    const plates = draft.role === 'driver'
      ? [...new Set(draft.plates.split(',').map(normalizePlate).filter(Boolean))]
      : [];
    const activePlate = plates.includes(draft.activePlate) ? draft.activePlate : plates[0] ?? '';

    setSaving(true);
    try {
      await adminUpdateUser(editing.uid, {
        fullName: draft.fullName.trim() || editing.fullName || 'Look Out! user',
        phone: normalizePhone(draft.phone),
        role: draft.role,
        plates,
        activePlate,
      });
      setToast(`Saved ${draft.fullName || editing.email}`);
      setEditing(null);
    } catch (err) {
      setToast(`Could not save: ${err?.message ?? err}`);
    } finally {
      setSaving(false);
    }
  };

  const changeRole = async (user, role) => {
    try {
      await adminUpdateUser(user.uid, { role });
      setToast(`${user.fullName || user.email} is now a ${role}`);
    } catch (err) {
      setToast(`Could not change role: ${err?.message ?? err}`);
    }
  };

  const removeUser = async (user) => {
    try {
      await adminDeleteUser(user.uid);
      setToast(`Profile for ${user.email} deleted`);
    } catch (err) {
      setToast(`Could not delete: ${err?.message ?? err}`);
    } finally {
      setConfirmUid('');
    }
  };

  /* -------------------------------- panel -------------------------------- */
  const panel = (
    <>
      <Section icon={ShieldCheck} title="Signed in as" tint="violet">
        <InfoRow label="Name" value={profile?.fullName} />
        <InfoRow label="Email" value={profile?.email} />
        <InfoRow label="Role" value="admin" />
        <p className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-2.5 py-2 text-[10px] leading-relaxed text-violet-200">
          You can use the Commuter and Driver views like a normal user, and manage every account
          from here.
        </p>
      </Section>

      <Section icon={Users} title="Overview" tint="cyan">
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Commuters', value: counts.commuter, cls: 'text-cyan-300' },
            { label: 'Drivers', value: counts.driver, cls: 'text-blue-300' },
            { label: 'Admins', value: counts.admin, cls: 'text-violet-300' },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-2 text-center"
            >
              <p className={`font-mono text-base font-bold ${stat.cls}`}>{stat.value}</p>
              <p className="text-[9px] uppercase tracking-wide text-slate-500">{stat.label}</p>
            </div>
          ))}
        </div>
        <InfoRow label="Accounts" value={users.length} />
        <InfoRow label="Live vehicles" value={vehicles.length} />
        <InfoRow label="Pokes logged" value={pokes.length} />
      </Section>

      <Section icon={Radio} title="Live now" badge={<span className="text-[10px] font-bold text-emerald-300">{vehicles.length}</span>}>
        {vehicles.length === 0 ? (
          <p className="text-[11px] text-slate-500">No jeepney is broadcasting right now.</p>
        ) : (
          <ul className="space-y-1.5">
            {vehicles.map((vehicle) => {
              const meta = statusMeta(vehicle);
              return (
                <li
                  key={vehicle.vehicleId}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-700/60 bg-slate-900/40 px-2.5 py-1.5"
                >
                  <span className="truncate font-mono text-[11px] font-bold text-slate-100">
                    {vehicle.vehicleId}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span
                      className="rounded-md px-1.5 py-0.5 text-[9px] font-bold"
                      style={{ backgroundColor: meta.soft, color: meta.color }}
                    >
                      {meta.label}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      {(Number(vehicle.speed) || 0).toFixed(0)} km/h
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section icon={Hand} title="Recent pokes" badge={<span className="text-[10px] font-bold text-cyan-300">{pokes.length}</span>}>
        {pokes.length === 0 ? (
          <p className="text-[11px] leading-relaxed text-slate-500">
            {firebaseReady
              ? 'No pokes stored yet.'
              : 'Pokes are stored in Firestore — configure Firebase to keep history.'}
          </p>
        ) : (
          <ul className="max-h-64 space-y-1.5 overflow-y-auto">
            {pokes.slice(0, 25).map((poke) => (
              <li key={poke.id} className="rounded-xl border border-slate-700/60 bg-slate-900/40 px-2.5 py-2">
                <p className="flex items-center justify-between gap-2 text-[11px] font-bold text-slate-100">
                  <span className="truncate font-mono">{poke.toPlate}</span>
                  <span className="shrink-0 text-[10px] font-normal text-slate-500">
                    {timeAgo(poke.createdAt)}
                  </span>
                </p>
                <p className="truncate text-[11px] text-slate-300">{poke.message || 'Poke! 👋'}</p>
                <p className="truncate text-[10px] text-slate-500">{poke.fromName || 'A commuter'}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );

  /* -------------------------------- stage -------------------------------- */
  return (
    <AppShell
      brand="Admin console"
      panel={panel}
      open={drawerOpen}
      onCloseDrawer={onCloseDrawer}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
    >
      <div className="h-full overflow-y-auto bg-slate-950 p-3 sm:p-5">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
              <ShieldCheck size={20} className="text-violet-400" /> Accounts
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Every commuter and driver on Look Out! — edit details, switch roles or remove them.
            </p>
          </div>
          <span className="rounded-full border border-slate-700/70 bg-slate-900/60 px-3 py-1.5 text-[11px] font-bold text-slate-300">
            {filtered.length} of {users.length}
          </span>
        </header>

        {!firebaseReady && (
          <div className="mb-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs leading-relaxed text-amber-200">
            <p className="flex items-center gap-1.5 font-bold">
              <AlertTriangle size={14} /> Account management needs Firebase
            </p>
            <p className="mt-1">
              Paste your web config into{' '}
              <code className="rounded bg-slate-900/70 px-1 font-mono">src/services/firebase.js</code>{' '}
              and publish <code className="font-mono">/firestore.rules</code>. The live-fleet and poke
              panels on the left keep working without it.
            </p>
          </div>
        )}

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-3 text-xs text-rose-200">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {/* filters */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="relative flex min-w-[13rem] flex-1 items-center">
            <Search size={14} className="pointer-events-none absolute left-3 text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, phone or plate…"
              className="w-full rounded-xl border border-slate-700 bg-slate-900/70 py-2 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/25"
            />
          </span>
          <div className="flex items-center gap-1 rounded-xl border border-slate-700/70 bg-slate-900/60 p-1">
            {['all', 'commuter', 'driver', 'admin'].map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => setRoleFilter(role)}
                className={`rounded-lg px-2.5 py-1.5 text-[11px] font-bold capitalize transition ${
                  roleFilter === role
                    ? 'bg-slate-700 text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {role}
              </button>
            ))}
          </div>
          {loading && <Loader2 size={16} className="animate-spin text-cyan-400" />}
        </div>

        {/* accounts table */}
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="hidden bg-slate-900/80 text-[10px] uppercase tracking-wide text-slate-500 sm:table-header-group">
              <tr>
                <th className="px-3 py-2.5 font-bold">Account</th>
                <th className="px-3 py-2.5 font-bold">Role</th>
                <th className="hidden px-3 py-2.5 font-bold md:table-cell">Contact</th>
                <th className="hidden px-3 py-2.5 font-bold lg:table-cell">Plates</th>
                <th className="px-3 py-2.5 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-xs text-slate-500">
                    {users.length === 0
                      ? 'No accounts yet — commuters and drivers appear here as soon as they sign up.'
                      : 'No account matches those filters.'}
                  </td>
                </tr>
              )}
              {filtered.map((user) => {
                const RoleIcon = ROLE_ICONS[user.role] ?? Users;
                const isMe = user.uid === profile?.uid;
                return (
                  <tr key={user.uid} className="align-top hover:bg-slate-800/30">
                    <td className="px-3 py-2.5">
                      <p className="font-semibold text-slate-100">
                        {user.fullName || '—'}
                        {isMe && (
                          <span className="ml-1.5 rounded bg-slate-700 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-300">
                            you
                          </span>
                        )}
                      </p>
                      <p className="truncate text-[11px] text-slate-400">{user.email}</p>
                      <p className="mt-0.5 text-[10px] text-slate-500 sm:hidden">
                        {user.phone || 'no number'}
                        {user.plates?.length ? ` · ${user.plates.join(', ')}` : ''}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        joined {user.createdAt ? new Date(toMillis(user.createdAt)).toLocaleDateString() : '—'}
                      </p>
                    </td>

                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                          ROLE_STYLES[user.role] ?? ROLE_STYLES.commuter
                        }`}
                      >
                        <RoleIcon size={10} />
                        {user.role ?? 'commuter'}
                      </span>
                      <select
                        value={user.role ?? 'commuter'}
                        onChange={(e) => changeRole(user, e.target.value)}
                        disabled={isMe}
                        aria-label={`Change role for ${user.email}`}
                        className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900/70 px-2 py-1 text-[11px] text-slate-200 focus:border-cyan-400 focus:outline-none disabled:opacity-40"
                      >
                        <option value="commuter">commuter</option>
                        <option value="driver">driver</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>

                    <td className="hidden px-3 py-2.5 md:table-cell">
                      <p className="text-slate-200">{user.phone || '—'}</p>
                      {user.activePlate ? (
                        <p className="mt-0.5 text-[10px] text-emerald-300">
                          on air · {user.activePlate}
                        </p>
                      ) : null}
                    </td>

                    <td className="hidden px-3 py-2.5 lg:table-cell">
                      {user.plates?.length ? (
                        <span className="flex flex-wrap gap-1">
                          {user.plates.map((plate) => (
                            <span
                              key={plate}
                              className="rounded-md border border-slate-700 bg-slate-900/60 px-1.5 py-0.5 font-mono text-[10px] text-slate-200"
                            >
                              {plate}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>

                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditor(user)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-600 px-2 py-1 text-[11px] font-bold text-slate-200 transition hover:border-cyan-400 hover:text-cyan-300"
                        >
                          <Pencil size={11} /> Edit
                        </button>
                        {confirmUid === user.uid ? (
                          <span className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => removeUser(user)}
                              className="rounded-lg bg-rose-500 px-2 py-1 text-[11px] font-bold text-white transition hover:bg-rose-400"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmUid('')}
                              aria-label="Cancel delete"
                              className="rounded-lg p-1 text-slate-400 hover:text-slate-200"
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmUid(user.uid)}
                            disabled={isMe}
                            title={isMe ? 'You cannot delete your own admin account' : 'Delete profile'}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-600 px-2 py-1 text-[11px] font-bold text-rose-300 transition hover:border-rose-400 hover:bg-rose-500/10 disabled:opacity-40"
                          >
                            <Trash2 size={11} /> Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="mt-3 flex items-start gap-1.5 text-[10px] leading-relaxed text-slate-500">
          <RefreshCw size={11} className="mt-0.5 shrink-0" />
          Deleting removes the Look Out! profile (the account stops appearing and can no longer be
          tracked). The email/password credential itself must be deleted from Firebase Authentication
          → Users, since one client cannot remove another user&rsquo;s login.
        </p>
      </div>

      {/* ------------------------------ edit modal ------------------------------ */}
      {editing && (
        <div className="fixed inset-0 z-[1600] flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-slate-700/70 bg-slate-900 p-5 shadow-2xl sm:rounded-3xl">
            <header className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="flex items-center gap-2 text-sm font-bold text-slate-100">
                  <Pencil size={14} className="text-cyan-400" /> Edit account
                </h3>
                <p className="truncate text-[11px] text-slate-400">{editing.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(null)}
                aria-label="Close editor"
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
              >
                <X size={16} />
              </button>
            </header>

            <div className="space-y-3.5">
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Full name
                </span>
                <input
                  value={draft.fullName}
                  onChange={(e) => setDraft((d) => ({ ...d, fullName: e.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/70 px-3 py-2.5 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/25"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Mobile number
                </span>
                <input
                  value={draft.phone}
                  inputMode="tel"
                  onChange={(e) => setDraft((d) => ({ ...d, phone: normalizePhone(e.target.value) }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/70 px-3 py-2.5 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/25"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Role
                </span>
                <select
                  value={draft.role}
                  onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}
                  disabled={editing.uid === profile?.uid}
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/70 px-3 py-2.5 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none disabled:opacity-50"
                >
                  <option value="commuter">Commuter</option>
                  <option value="driver">Driver</option>
                  <option value="admin">Admin</option>
                </select>
                {editing.uid === profile?.uid && (
                  <span className="mt-1 block text-[10px] text-amber-300">
                    You cannot change your own admin role.
                  </span>
                )}
              </label>

              {draft.role === 'driver' && (
                <label className="block">
                  <span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    <CreditCard size={12} /> Plate numbers
                  </span>
                  <input
                    value={draft.plates}
                    onChange={(e) => setDraft((d) => ({ ...d, plates: e.target.value }))}
                    placeholder="BMS 1930, UGS 2403"
                    className="w-full rounded-xl border border-slate-700 bg-slate-800/70 px-3 py-2.5 font-mono text-sm uppercase tracking-wider text-slate-100 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/25"
                  />
                  <span className="mt-1 block text-[10px] text-slate-500">
                    Comma-separated. The first plate becomes the active one.
                  </span>
                </label>
              )}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-xl border border-slate-700 px-3.5 py-2.5 text-xs font-bold text-slate-300 transition hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEditor}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-500 px-4 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-60"
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed left-1/2 top-16 z-[1700] flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-cyan-400/50 bg-slate-900/95 px-4 py-2 text-xs font-bold text-cyan-200 shadow-xl backdrop-blur">
          <Check size={13} /> {toast}
        </div>
      )}
    </AppShell>
  );
}
