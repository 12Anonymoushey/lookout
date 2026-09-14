import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bus,
  CreditCard,
  Hand,
  Loader2,
  Pencil,
  Radio,
  Save,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import AppShell, { InfoRow, Section } from './AppShell.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { adminDeleteUser, adminUpdateUser, watchAllPokes, watchAllUsers } from '../services/adminService.js';
import { firebaseReady, normalizePhone, normalizePlate } from '../services/authService.js';
import { timeAgo } from '../services/pokeService.js';
import { statusMeta } from '../utils/vehicle.js';
import { SearchSortBar, ConfirmToast } from './KebabMenu.jsx';

const ROLE_STYLES = {
  commuter: 'bg-[var(--lo-cyan)]/15 text-[var(--lo-cyan)]',
  driver: 'bg-[var(--lo-sky)]/15 text-[var(--lo-sky)]',
  admin: 'bg-[#c39bd3]/15 text-[#c39bd3]',
};

const ROLE_ICONS = { commuter: Users, driver: Bus, admin: ShieldCheck };

const emptyDraft = { fullName: '', phone: '', role: 'commuter', plates: '', activePlate: '' };

export default function AdminView({ vehicles = [], onCloseDrawer, drawerOpen, collapsed, onToggleCollapse }) {
  const { profile } = useAuth();
  const [users, setUsers] = useState([]);
  const [pokes, setPokes] = useState([]);
  const [_loading, _setLoading] = useState(firebaseReady);
  const [_error, _setError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [confirmUid, setConfirmUid] = useState('');
  const [toast, setToast] = useState('');
  const [sort, setSort] = useState({ field: 'fullName', dir: 'asc' });

  useEffect(() => {
    if (!firebaseReady) { _setLoading(false); return undefined; }
    return watchAllUsers(
      (list) => { setUsers(list); _setError(''); _setLoading(false); },
      (err) => {
        _setError(err?.code === 'permission-denied' ? 'Firestore refused — publish /firestore.rules.' : (err?.message ?? 'Could not load accounts.'));
        _setLoading(false);
      },
    );
  }, []);

  useEffect(() => {
    if (!firebaseReady) return undefined;
    return watchAllPokes(setPokes, () => {});
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  const counts = useMemo(() => {
    const base = { commuter: 0, driver: 0, admin: 0 };
    for (const user of users) base[user.role] = (base[user.role] ?? 0) + 1;
    return base;
  }, [users]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    let list = users.filter((user) => {
      if (roleFilter !== 'all' && user.role !== roleFilter) return false;
      if (!needle) return true;
      return [user.fullName, user.email, user.phone, ...(user.plates ?? [])].filter(Boolean).some((f) => String(f).toLowerCase().includes(needle));
    });
    list = [...list].sort((a, b) => {
      const va = a[sort.field] ?? '';
      const vb = b[sort.field] ?? '';
      return sort.dir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
    return list;
  }, [users, search, roleFilter, sort]);

  const openEditor = (user) => {
    setEditing(user);
    setConfirmUid('');
    setDraft({ fullName: user.fullName ?? '', phone: user.phone ?? '', role: user.role ?? 'commuter', plates: (user.plates ?? []).join(', '), activePlate: user.activePlate ?? '' });
  };

  const saveEditor = async () => {
    if (!editing) return;
    const plates = draft.role === 'driver' ? [...new Set(draft.plates.split(',').map(normalizePlate).filter(Boolean))] : [];
    const activePlate = plates.includes(draft.activePlate) ? draft.activePlate : plates[0] ?? '';
    setSaving(true);
    try {
      await adminUpdateUser(editing.uid, { fullName: draft.fullName.trim() || editing.fullName || 'User', phone: normalizePhone(draft.phone), role: draft.role, plates, activePlate });
      setToast(`Saved ${draft.fullName || editing.email}`);
      setEditing(null);
    } catch (err) { setToast(`Could not save: ${err?.message ?? err}`); }
    finally { setSaving(false); }
  };

  const removeUser = async (user) => {
    try {
      await adminDeleteUser(user.uid);
      setToast(`Deleted ${user.email}`);
    } catch (err) { setToast(`Could not delete: ${err?.message ?? err}`); }
    finally { setConfirmUid(''); }
  };

  const panel = (
    <>
      <Section icon={ShieldCheck} title="Admin" tint="pink">
        <InfoRow label="Name" value={profile?.fullName} />
        <InfoRow label="Email" value={profile?.email} />
        <InfoRow label="Role" value="admin" />
      </Section>

      <Section icon={Users} title="Overview" tint="cyan">
        <div className="grid grid-cols-3 gap-2">
          {[{ label: 'Commuters', value: counts.commuter, cls: 'text-[var(--lo-cyan)]' }, { label: 'Drivers', value: counts.driver, cls: 'text-[var(--lo-sky)]' }, { label: 'Admins', value: counts.admin, cls: 'text-[#c39bd3]' }].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-[var(--lo-card-border)] bg-[#1e1430]/50 p-2 text-center">
              <p className={`font-mono text-base font-bold ${stat.cls}`}>{stat.value}</p>
              <p className="text-[9px] uppercase tracking-wide text-[#8a7098]">{stat.label}</p>
            </div>
          ))}
        </div>
        <InfoRow label="Total" value={users.length} />
        <InfoRow label="Live vehicles" value={vehicles.length} />
        <InfoRow label="Pokes" value={pokes.length} />
      </Section>

      <Section icon={Radio} title="Live Now" defaultOpen={false} tint="cyan">
        {vehicles.length === 0 ? (
          <p className="text-[11px] text-[#8a7098]">No vehicles broadcasting.</p>
        ) : (
          <ul className="space-y-1.5">
            {vehicles.map((vehicle) => {
              const meta = statusMeta(vehicle);
              return (
                <li key={vehicle.vehicleId} className="flex items-center justify-between gap-2 rounded-xl border border-[var(--lo-card-border)] bg-[#1e1430]/40 px-2.5 py-1.5">
                  <span className="truncate font-mono text-[11px] font-bold text-[#e0d4ec]">{vehicle.vehicleId}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="rounded-md px-1.5 py-0.5 text-[9px] font-bold" style={{ backgroundColor: meta.soft, color: meta.color }}>{meta.label}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section icon={Hand} title="Recent Pokes" defaultOpen={false} tint="pink">
        {pokes.length === 0 ? (
          <p className="text-[11px] text-[#8a7098]">No pokes yet.</p>
        ) : (
          <ul className="max-h-64 space-y-1.5 overflow-y-auto">
            {pokes.slice(0, 25).map((poke) => (
              <li key={poke.id} className="rounded-xl border border-[var(--lo-card-border)] bg-[#1e1430]/40 px-2.5 py-2">
                <p className="flex items-center justify-between gap-2 text-[11px] font-bold text-[#e0d4ec]">
                  <span className="truncate font-mono">{poke.toPlate}</span>
                  <span className="shrink-0 text-[10px] font-normal text-[#8a7098]">{timeAgo(poke.createdAt)}</span>
                </p>
                <p className="truncate text-[10px] text-[#8a7098]">{poke.fromName}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );

  return (
    <AppShell brand="Admin" panel={panel} open={drawerOpen} onCloseDrawer={onCloseDrawer} collapsed={collapsed} onToggleCollapse={onToggleCollapse}>
      <div className="h-full overflow-y-auto bg-[#0e0a18] p-3 sm:p-5">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
              <ShieldCheck size={20} style={{ color: 'var(--lo-pink)' }} /> Accounts
            </h2>
          </div>
          <span className="rounded-full border border-[var(--lo-card-border)] bg-[var(--lo-card)]/60 px-3 py-1.5 text-[11px] font-bold text-[#d8c8e8]">
            {filtered.length} / {users.length}
          </span>
        </header>

        {!firebaseReady && (
          <div className="mb-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs leading-relaxed text-amber-200">
            <p className="flex items-center gap-1.5 font-bold"><AlertTriangle size={14} /> Account management needs Firebase</p>
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <SearchSortBar
            search={search}
            onSearchChange={setSearch}
            sortField={sort.field}
            sortDir={sort.dir}
            onSortToggle={(field, dir) => setSort({ field, dir })}
            fields={['fullName', 'email', 'phone']}
            placeholder="Search accounts…"
          />
          <div className="flex items-center gap-1.5">
            {['all', 'commuter', 'driver', 'admin'].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRoleFilter(r)}
                className={`rounded-full px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide transition ${roleFilter === r ? 'bg-[var(--lo-pink)] text-white' : 'border border-[var(--lo-card-border)] bg-[var(--lo-card)]/40 text-[#d8c8e8] hover:border-[var(--lo-pink)]/40'}`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          {filtered.map((user) => (
            <div key={user.uid} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--lo-card-border)] bg-[var(--lo-card)]/30 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-[#f0e6f6]">{user.fullName || 'User'}</p>
                <p className="truncate text-[11px] text-[#8a7098]">{user.email}</p>
                {user.phone && <p className="text-[10px] text-[#8a7098]">{user.phone}</p>}
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${ROLE_STYLES[user.role] || ROLE_STYLES.commuter}`}>
                    {(() => { const I = ROLE_ICONS[user.role] || Users; return <I size={10} />; })()}
                    {user.role}
                  </span>
                  {user.plates?.map((p) => (
                    <span key={p} className="inline-flex items-center gap-1 rounded-full bg-[var(--lo-card)]/60 px-2 py-0.5 text-[10px] font-bold text-[#d8c8e8]">
                      <CreditCard size={9} /> {p}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-1">
                {user.uid !== profile?.uid && (
                  <>
                    <button type="button" onClick={() => openEditor(user)} className="rounded-lg p-1.5 text-[#8a7098] transition hover:bg-[#3a2a50] hover:text-[#d8c8e8]" title="Edit">
                      <Pencil size={13} />
                    </button>
                    <div className="relative">
                      <button type="button" onClick={() => setConfirmUid(confirmUid === user.uid ? '' : user.uid)} className="rounded-lg p-1.5 text-rose-400 transition hover:bg-rose-500/10" title="Delete">
                        <Trash2 size={13} />
                      </button>
                      {confirmUid === user.uid && (
                        <div className="absolute right-0 top-full z-50 mt-1 rounded-xl border border-rose-500/40 bg-[var(--lo-panel)] p-3 shadow-xl">
                          <p className="mb-2 text-[10px] font-bold text-rose-300">Delete {user.email}?</p>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => removeUser(user)} className="rounded-lg bg-rose-500 px-2.5 py-1 text-[10px] font-bold text-white">Yes, delete</button>
                            <button type="button" onClick={() => setConfirmUid('')} className="rounded-lg border border-[var(--lo-card-border)] px-2.5 py-1 text-[10px] font-bold text-[#d8c8e8]">Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-[#0e0a18]/80 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--lo-card-border)] bg-[var(--lo-panel)] shadow-2xl">
            <header className="flex items-center justify-between border-b border-[var(--lo-panel-border)] px-5 py-3">
              <h3 className="text-sm font-bold text-[#f0e6f6]">Edit {editing.email}</h3>
              <button type="button" onClick={() => setEditing(null)} className="rounded-lg p-1 text-[#8a7098] hover:text-[#d8c8e8]"><X size={16} /></button>
            </header>
            <div className="space-y-3 p-5">
              <label className="block">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#8a7098]">Full name</span>
                <input value={draft.fullName} onChange={(e) => setDraft((d) => ({ ...d, fullName: e.target.value }))} className="w-full rounded-xl border border-[var(--lo-card-border)] bg-[#1e1430] px-3 py-2 text-sm text-[#f0e6f6] focus:border-[var(--lo-pink)] focus:outline-none" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#8a7098]">Mobile</span>
                <input value={draft.phone} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} className="w-full rounded-xl border border-[var(--lo-card-border)] bg-[#1e1430] px-3 py-2 text-sm text-[#f0e6f6] focus:border-[var(--lo-pink)] focus:outline-none" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#8a7098]">Role</span>
                <select value={draft.role} onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))} className="w-full appearance-none rounded-xl border border-[var(--lo-card-border)] bg-[#1e1430] px-3 py-2 text-sm text-[#f0e6f6] focus:border-[var(--lo-pink)] focus:outline-none">
                  <option value="commuter">Commuter</option>
                  <option value="driver">Driver</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              {draft.role === 'driver' && (
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#8a7098]">Plate numbers (comma-separated)</span>
                  <input value={draft.plates} onChange={(e) => setDraft((d) => ({ ...d, plates: e.target.value }))} className="w-full rounded-xl border border-[var(--lo-card-border)] bg-[#1e1430] px-3 py-2 text-sm text-[#f0e6f6] focus:border-[var(--lo-pink)] focus:outline-none" />
                </label>
              )}
            </div>
            <footer className="flex items-center justify-end gap-2 border-t border-[var(--lo-panel-border)] px-5 py-3">
              <button type="button" onClick={() => setEditing(null)} className="rounded-xl border border-[var(--lo-card-border)] px-4 py-2 text-xs font-bold text-[#d8c8e8] transition hover:bg-[#3a2a50]">Cancel</button>
              <button type="button" onClick={saveEditor} disabled={saving} className="flex items-center gap-1.5 rounded-xl bg-[var(--lo-pink)] px-4 py-2 text-xs font-bold text-white shadow-lg shadow-[#FF69B4]/25 transition hover:bg-[#ff80c0] disabled:opacity-60">
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                {saving ? 'Saving…' : 'Save'}
              </button>
            </footer>
          </div>
        </div>
      )}

      <ConfirmToast message={toast} onClose={() => setToast('')} />
    </AppShell>
  );
}
