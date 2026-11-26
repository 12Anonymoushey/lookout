import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bus,
  CloudRain,
  Hand,
  Loader2,
  MapPin,
  Pencil,
  Radio,
  Save,
  ShieldCheck,
  ClipboardList,
  Trash2,
  Inbox,
  Users,
  X,
} from 'lucide-react';
import AppShell, { AnimatedPopup, InfoRow, ProfileScreen, ScreenBackButton, Section } from './AppShell.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { adminDeletePoke, adminDeleteUser, adminUpdateUser, watchAllPokes, watchAllUsers } from '../services/adminService.js';
import { firebaseReady, normalizePhone, normalizePlate } from '../services/authService.js';
import { auth } from '../services/firebase.js';
import {
  deleteAnalyticsRecord,
  mergeLocalAndCloudAnalytics,
  saveAnalyticsRecord,
  watchAllAnalyticsRecords,
} from '../services/analyticsService.js';
import { timeAgo } from '../services/pokeService.js';
import { ExpandableListCard, SearchSortBar, ConfirmToast } from './KebabMenu.jsx';
import { createAnnouncement, updateAnnouncement, deleteAnnouncement, getAllAnnouncements } from '../services/announcementService.js';
import { addAdminLog, clearAdminLogs, getAdminLogs } from '../services/adminActivityService.js';
import EmergencyRadio from './EmergencyRadio.jsx';
import WeatherTab from './WeatherTab.jsx';
import { deleteUtilityInboxItem, getUtilityInbox, markUtilityInboxRead } from '../services/utilityInboxService.js';

const ROLE_STYLES = {
  commuter: 'bg-slate-50 text-blue-600',
  driver: 'bg-emerald-500 text-slate-900',
  admin: 'bg-slate-50 text-slate-900',
};

const emptyDraft = { fullName: '', phone: '', role: 'commuter', plates: '', activePlate: '' };

function FleetBarChart({ title, data, color = '#2563eb' }) {
  const max = Math.max(...data.map((item) => Number(item.value) || 0), 1);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <p className="mb-3 text-[10px] font-bold uppercase tracking-wide text-slate-500">{title}</p>
      <div className="flex h-28 items-end gap-2">
        {data.map((item, index) => (
          <div key={`${item.label}-${index}`} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[9px] font-bold text-slate-900">{item.value}</span>
            <div className="w-full min-w-2 rounded-t-md transition-[height] duration-300" style={{ height: `${Math.max(6, item.value / max * 78)}px`, background: color }} />
            <span className="max-w-full truncate text-[8px] text-slate-500">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FleetAnalytics({ rides, trips }) {
  const now = new Date();
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    const rideCount = rides.filter((ride) => ride.rideAt && new Date(ride.rideAt).toDateString() === date.toDateString()).length;
    const tripCount = trips.filter((trip) => (trip.startedAtMs || trip.startedAt) && new Date(trip.startedAtMs || trip.startedAt).toDateString() === date.toDateString()).length;
    return { label: date.toLocaleDateString([], { weekday: 'short' }), value: rideCount + tripCount };
  });
  const routeCounts = {};
  [...rides, ...trips].forEach((record) => {
    const route = record.routeName || record.operatorName || record.routeDirection || 'Unknown';
    routeCounts[route] = (routeCounts[route] || 0) + 1;
  });
  const routes = Object.entries(routeCounts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value]) => ({ label: label.length > 14 ? `${label.slice(0, 14)}…` : label, value }));
  const vehicles = {};
  [...rides, ...trips].forEach((record) => {
    const plate = record.plate || record.vehicleId || 'Unknown';
    vehicles[plate] = (vehicles[plate] || 0) + 1;
  });
  const vehicleData = Object.entries(vehicles).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value]) => ({ label, value }));
  const completedTrips = trips.filter((trip) => trip.destinationReached || /finished|completed/i.test(trip.status || '')).length;
  const completedRate = trips.length ? Math.round(completedTrips / trips.length * 100) : 0;
  const speeds = trips.map((trip) => Number(trip.averageSpeedKmh) || 0).filter(Boolean);
  const averageSpeed = speeds.length ? speeds.reduce((sum, value) => sum + value, 0) / speeds.length : 0;
  const busiestDay = [...days].sort((a, b) => b.value - a.value)[0];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['Recorded trips', trips.length],
          ['Recorded rides', rides.length],
          ['Trip completion', `${completedRate}%`],
          ['Avg. PUV speed', `${averageSpeed.toFixed(1)} km/h`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white px-2 py-3 text-center">
            <p className="text-base font-bold text-slate-900">{value}</p>
            <p className="text-[8px] uppercase tracking-wide text-slate-500">{label}</p>
          </div>
        ))}
      </div>
      <FleetBarChart title="Fleet activity by day" data={days} />
      <FleetBarChart title="Top routes" data={routes.length ? routes : [{ label: 'No routes', value: 0 }]} color="#7c3aed" />
      <FleetBarChart title="Trips and rides by PUV" data={vehicleData.length ? vehicleData : [{ label: 'No PUVs', value: 0 }]} color="#0ea5e9" />
      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Trip completion forecast</p>
        <p className="mt-2 text-xs text-slate-700">{completedRate >= 80 ? 'Current fleet reliability is strong.' : 'Route completion is below target; review stopped trips.'}</p>
        {busiestDay?.value > 0 && <p className="mt-1 text-[10px] text-slate-500">Peak activity is typically on {busiestDay.label}.</p>}
      </div>
    </div>
  );
}

export default function AdminView({ vehicles = [], onViewChange, onOpenDrawer, onCloseDrawer, drawerOpen, collapsed, onToggleCollapse, radioLogs = [], playingRadioId = '', utilityProfile }) {
  const { profile } = useAuth();
  const [users, setUsers] = useState([]);
  const [pokes, setPokes] = useState([]);
  const [_loading, _setLoading] = useState(firebaseReady);
  const [_error, _setError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmUid, setConfirmUid] = useState('');
  const [toast, setToast] = useState('');
  const [sort, setSort] = useState({ field: 'fullName', dir: 'asc' });
  const [selectedUser, setSelectedUser] = useState(null);
  const [rides, setRides] = useState([]);
  const [trips, setTrips] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [announcementTab, setAnnouncementTab] = useState('make');
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementMessage, setAnnouncementMessage] = useState('');
  const [editingAnnouncement, setEditingAnnouncement] = useState(null);
  const [announcementDraft, setAnnouncementDraft] = useState({ title: '', message: '' });
  const [confirmAnnouncementId, setConfirmAnnouncementId] = useState('');
  const [recordConfirm, setRecordConfirm] = useState(null);
  const [recordEdit, setRecordEdit] = useState(null);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [selectedAnnouncements, setSelectedAnnouncements] = useState([]);
  const [selectedPokes, setSelectedPokes] = useState([]);
  const [bulkConfirm, setBulkConfirm] = useState('');
  const [adminLogs, setAdminLogs] = useState(() => getAdminLogs());
  const [utilityInbox, setUtilityInbox] = useState(() => getUtilityInbox());

  useEffect(() => {
    const refreshInbox = () => setUtilityInbox(getUtilityInbox());
    window.addEventListener('storage', refreshInbox);
    window.addEventListener('lookout-utility-inbox-updated', refreshInbox);
    return () => {
      window.removeEventListener('storage', refreshInbox);
      window.removeEventListener('lookout-utility-inbox-updated', refreshInbox);
    };
  }, []);

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
    const readStored = (key, fallback = []) => {
      try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
      catch { return fallback; }
    };
    setRides(readStored('lo_recent_rides'));
    setTrips(readStored('lo_driver_trips'));
    setAnnouncements(getAllAnnouncements());
  }, []);

  useEffect(() => {
    if (!firebaseReady) return undefined;
    return watchAllAnalyticsRecords(
      (records) => {
        const readStored = (key) => {
          try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
        };
        setRides(mergeLocalAndCloudAnalytics(
          readStored('lo_recent_rides'),
          records.filter((record) => record.recordType === 'ride'),
        ));
        setTrips(mergeLocalAndCloudAnalytics(
          readStored('lo_driver_trips'),
          records.filter((record) => record.recordType === 'trip'),
        ));
      },
      (syncError) => setToast(`Could not load cloud analytics: ${syncError.message}`),
    );
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

  const updateUserPassword = async () => {
    if (!editing || newPassword.length < 6) {
      setToast('Password must be at least 6 characters');
      return;
    }
    setSaving(true);
    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL?.trim() || 'https://lookout-p8fw.onrender.com';
      const idToken = await auth?.currentUser?.getIdToken();
      const response = await fetch(`${backendUrl.replace(/\/+$/, '')}/admin/users/${encodeURIComponent(editing.uid)}/password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ password: newPassword }),
      });
      if (!response.ok) throw new Error((await response.json()).error || 'Password update failed');
      setNewPassword('');
      setToast('User password updated');
      addAdminLog('Updated user password', editing.email || editing.uid);
    } catch (err) {
      setToast(err?.message || 'Could not update password');
    } finally {
      setSaving(false);
    }
  };

  const removeUser = async (user) => {
    try {
      await adminDeleteUser(user.uid);
      addAdminLog('Deleted account', user.email || user.fullName || user.uid);
      setAdminLogs(getAdminLogs());
      setToast(`Deleted ${user.email}`);
    } catch (err) { setToast(`Could not delete: ${err?.message ?? err}`); }
    finally { setConfirmUid(''); }
  };

  const confirmBulkDelete = async () => {
    if (bulkConfirm === 'users') {
      for (const uid of selectedUsers.filter((id) => id !== profile?.uid)) await adminDeleteUser(uid).catch(() => {});
      addAdminLog('Deleted accounts', `${selectedUsers.length} selected account(s)`);
      setSelectedUsers([]);
      setToast(`${selectedUsers.length} accounts deleted`);
    } else if (bulkConfirm === 'announcements') {
      selectedAnnouncements.forEach(deleteAnnouncement);
      setAnnouncements(getAllAnnouncements());
      addAdminLog('Deleted announcements', `${selectedAnnouncements.length} announcement(s)`);
      setSelectedAnnouncements([]);
      setToast(`${selectedAnnouncements.length} announcements deleted`);
    } else if (bulkConfirm === 'pokes') {
      for (const id of selectedPokes) await adminDeletePoke(id).catch(() => {});
      setPokes((current) => current.filter((poke) => !selectedPokes.includes(poke.id)));
      addAdminLog('Deleted pokes', `${selectedPokes.length} poke(s)`);
      setSelectedPokes([]);
      setToast(`${selectedPokes.length} pokes deleted`);
    }
    setAdminLogs(getAdminLogs());
    setBulkConfirm('');
  };

  const persistRides = (next) => {
    const retainedDocs = new Set(next.map((ride) => ride.firestoreId).filter(Boolean));
    rides.filter((ride) => ride.firestoreId && !retainedDocs.has(ride.firestoreId)).forEach((ride) => {
      deleteAnalyticsRecord(ride)
        .catch((syncError) => setToast(`Ride removed locally, but cloud deletion failed: ${syncError.message}`));
    });
    setRides(next);
    localStorage.setItem('lo_recent_rides', JSON.stringify(next));
  };
  const persistTrips = (next) => {
    const retainedDocs = new Set(next.map((trip) => trip.firestoreId).filter(Boolean));
    trips.filter((trip) => trip.firestoreId && !retainedDocs.has(trip.firestoreId)).forEach((trip) => {
      deleteAnalyticsRecord(trip)
        .catch((syncError) => setToast(`Trip removed locally, but cloud deletion failed: ${syncError.message}`));
    });
    setTrips(next);
    localStorage.setItem('lo_driver_trips', JSON.stringify(next));
  };
  const deleteRecord = () => {
    if (!recordConfirm) return;
    if (recordConfirm.type === 'ride') persistRides(rides.filter((ride) => ride.id !== recordConfirm.id));
    if (recordConfirm.type === 'trip') persistTrips(trips.filter((trip) => trip.id !== recordConfirm.id));
    setToast(`${recordConfirm.type === 'ride' ? 'Ride' : 'Trip'} deleted`);
    setRecordConfirm(null);
  };
  const saveRecord = () => {
    if (!recordEdit) return;
    if (recordEdit.type === 'ride') {
      const next = rides.map((ride) => ride.id === recordEdit.id ? { ...ride, ...recordEdit.values } : ride);
      const updatedRide = next.find((ride) => ride.id === recordEdit.id);
      persistRides(next);
      if (firebaseReady && updatedRide?.ownerUid) {
        saveAnalyticsRecord(updatedRide.ownerUid, 'ride', updatedRide)
          .catch((syncError) => setToast(`Ride updated locally, but cloud sync failed: ${syncError.message}`));
      }
    } else {
      const next = trips.map((trip) => trip.id === recordEdit.id ? { ...trip, ...recordEdit.values } : trip);
      const updatedTrip = next.find((trip) => trip.id === recordEdit.id);
      persistTrips(next);
      if (firebaseReady && updatedTrip?.ownerUid) {
        saveAnalyticsRecord(updatedTrip.ownerUid, 'trip', updatedTrip)
          .catch((syncError) => setToast(`Trip updated locally, but cloud sync failed: ${syncError.message}`));
      }
    }
    setToast(`${recordEdit.type === 'ride' ? 'Ride' : 'Trip'} updated`);
    setRecordEdit(null);
  };
  const postAnnouncement = () => {
    if (!announcementTitle.trim() || !announcementMessage.trim()) return;
    createAnnouncement({ driverUid: profile?.uid || 'admin', driverName: profile?.fullName || 'Administrator', plate: profile?.activePlate || 'Admin', title: announcementTitle.trim(), message: announcementMessage.trim() });
    setAnnouncements(getAllAnnouncements());
    setAnnouncementTitle('');
    setAnnouncementMessage('');
    setToast('Announcement posted');
  };
  const saveAnnouncement = () => {
    if (!editingAnnouncement) return;
    updateAnnouncement(editingAnnouncement.id, { title: announcementDraft.title.trim(), message: announcementDraft.message.trim() });
    setAnnouncements(getAllAnnouncements());
    setEditingAnnouncement(null);
    setToast('Announcement updated');
  };
  const removeAnnouncement = (id) => {
    deleteAnnouncement(id);
    setAnnouncements(getAllAnnouncements());
    addAdminLog('Deleted announcement', announcements.find((item) => item.id === id)?.title || id);
    setAdminLogs(getAdminLogs());
    setConfirmAnnouncementId('');
    setToast('Announcement deleted');
  };

  const panel = (
    <>
      <Section icon={ShieldCheck} title="Admin" tint="primary">
        <ProfileScreen
          profile={profile}
          role="admin"
          onEdit={() => profile && openEditor(profile)}
          fallbackName="Administrator"
          stats={[
            { label: 'Account', value: 'Admin' },
            { label: 'Users', value: users.length },
          ]}
        />
      </Section>

      <Section id="admin-overview" icon={Users} title="Overview" tint="primary">
        <div className="grid grid-cols-3 gap-2">
          {[{ label: 'Commuters', value: counts.commuter, cls: 'text-blue-600' }, { label: 'Drivers', value: counts.driver, cls: 'text-slate-900' }, { label: 'Admins', value: counts.admin, cls: 'text-slate-900' }].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-slate-200 bg-white p-2 text-center">
              <p className={`font-mono text-base font-bold ${stat.cls}`}>{stat.value}</p>
              <p className="text-[9px] uppercase tracking-wide text-slate-500">{stat.label}</p>
            </div>
          ))}
        </div>
        <InfoRow label="Total" value={users.length} />
        <InfoRow label="Live vehicles" value={vehicles.length} />
        <InfoRow label="Pokes" value={pokes.length} />
        <FleetAnalytics rides={rides} trips={trips} />
      </Section>

      <Section icon={Radio} title="Announcements" tint="primary" defaultOpen={false} flat>
        <div className="space-y-3">
          {announcementTab === 'make' && (
            <div className="space-y-2 lo-tab-content">
              <input value={announcementTitle} onChange={(e) => setAnnouncementTitle(e.target.value)} placeholder="Announcement title"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900" />
              <textarea value={announcementMessage} onChange={(e) => setAnnouncementMessage(e.target.value)} placeholder="Announcement details" rows={3}
                className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900" />
              <button type="button" onClick={postAnnouncement} disabled={!announcementTitle.trim() || !announcementMessage.trim()} className="w-full rounded-xl bg-blue-600 py-2.5 text-xs font-bold text-white disabled:opacity-40">Post Announcement</button>
            </div>
          )}
          {announcementTab === 'mine' && (
            <div className="space-y-1.5 lo-tab-content">
              <div className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5">
                <label className="flex items-center gap-2 text-[9px] font-bold text-slate-500">
                  <input type="checkbox" checked={announcements.filter((item) => item.driverUid === profile?.uid).length > 0 && announcements.filter((item) => item.driverUid === profile?.uid).every((item) => selectedAnnouncements.includes(item.id))}
                    onChange={(event) => setSelectedAnnouncements(event.target.checked ? announcements.filter((item) => item.driverUid === profile?.uid).map((item) => item.id) : [])} /> Select all
                </label>
                {selectedAnnouncements.length > 0 && <button type="button" onClick={() => setBulkConfirm('announcements')} className="flex items-center gap-1 rounded-lg bg-red-500 px-2 py-1 text-[9px] font-bold text-white"><Trash2 size={11} /> Delete {selectedAnnouncements.length}</button>}
              </div>
              {announcements.filter((item) => item.driverUid === profile?.uid).map((item) => (
                <ExpandableListCard
                  key={item.id}
                  leading={<input type="checkbox" checked={selectedAnnouncements.includes(item.id)}
                    onChange={(event) => setSelectedAnnouncements((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))}
                    aria-label={`Select announcement ${item.title}`} />}
                  summary={<><p className="text-[10px] font-semibold text-slate-500">{new Date(item.createdAt).toLocaleDateString()}</p><p className="truncate text-xs font-bold text-slate-900">{item.title}</p></>}
                  details={<><p className="text-[10px] leading-relaxed text-slate-700">{item.message}</p><p className="mt-1 text-[9px] text-slate-500">{item.driverName} · {item.plate}</p></>}
                  footer={confirmAnnouncementId === item.id && (
                    <div className="mt-2 flex items-center justify-between rounded-lg bg-red-50 px-2 py-1.5">
                      <span className="text-[9px] font-semibold text-red-700">Delete this announcement?</span>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => setConfirmAnnouncementId('')} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[9px] font-bold">Cancel</button>
                        <button type="button" onClick={() => removeAnnouncement(item.id)} className="rounded-md bg-red-500 px-2 py-1 text-[9px] font-bold text-white">Delete</button>
                      </div>
                    </div>
                  )}
                  actions={[
                    { icon: Pencil, label: 'Edit', onClick: () => { setEditingAnnouncement(item); setAnnouncementDraft({ title: item.title, message: item.message }); } },
                    { icon: Trash2, label: 'Delete', danger: true, onClick: () => setConfirmAnnouncementId(confirmAnnouncementId === item.id ? '' : item.id) },
                  ]}
                />
              ))}
              {!announcements.some((item) => item.driverUid === profile?.uid) && <p className="py-2 text-center text-[11px] text-slate-500">No announcements yet.</p>}
            </div>
          )}
          <div className="grid grid-cols-3 rounded-xl bg-slate-100 p-1">
            {[['make', 'Make'], ['mine', 'My'], ['all', 'All']].map(([id, label]) => (
              <button key={id} type="button" onClick={() => setAnnouncementTab(id)} className={`rounded-lg py-1.5 text-[10px] font-bold ${announcementTab === id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>{label}</button>
            ))}
          </div>
          {announcementTab === 'all' && (
            <div className="space-y-1.5 lo-tab-content">
              {announcements.map((item) => (
                <ExpandableListCard
                  key={item.id}
                  summary={<><p className="text-[10px] font-semibold text-slate-500">{new Date(item.createdAt).toLocaleDateString()}</p><p className="truncate text-xs font-bold text-slate-900">{item.title}</p></>}
                  details={<><p className="text-[10px] leading-relaxed text-slate-700">{item.message}</p><p className="mt-1 text-[9px] text-slate-500">{item.driverName} · {item.plate}</p></>}
                />
              ))}
            </div>
          )}
        </div>
      </Section>

      <Section icon={Hand} title="Recent Pokes" defaultOpen={false} tint="primary" flat>
        {pokes.length === 0 ? (
          <p className="text-[11px] text-slate-500">No pokes yet.</p>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5">
              <label className="flex items-center gap-2 text-[9px] font-bold text-slate-500">
                <input type="checkbox" checked={pokes.every((poke) => selectedPokes.includes(poke.id))}
                  onChange={(event) => setSelectedPokes(event.target.checked ? pokes.map((poke) => poke.id) : [])} /> Select all
              </label>
              {selectedPokes.length > 0 && <button type="button" onClick={() => setBulkConfirm('pokes')} className="flex items-center gap-1 rounded-lg bg-red-500 px-2 py-1 text-[9px] font-bold text-white"><Trash2 size={11} /> Delete {selectedPokes.length}</button>}
            </div>
            {pokes.slice(0, 25).map((poke) => (
              <ExpandableListCard
                key={poke.id}
                leading={<input type="checkbox" checked={selectedPokes.includes(poke.id)}
                  onChange={(event) => setSelectedPokes((current) => event.target.checked ? [...current, poke.id] : current.filter((id) => id !== poke.id))}
                  aria-label={`Select poke for ${poke.toPlate}`} />}
                summary={<><p className="text-[10px] font-semibold text-slate-500">{timeAgo(poke.createdAt)}</p><p className="truncate font-mono text-xs font-bold text-slate-900">{poke.toPlate}</p></>}
                details={<dl className="space-y-1 text-[10px]"><div className="flex justify-between gap-2"><dt className="text-slate-500">From</dt><dd className="text-right text-slate-900">{poke.fromName}</dd></div><div className="flex justify-between gap-2"><dt className="text-slate-500">Sent</dt><dd className="text-right text-slate-900">{new Date(poke.createdAt).toLocaleString()}</dd></div></dl>}
              />
            ))}
          </div>
        )}
      </Section>

      <Section icon={ClipboardList} title="Admin Logs" defaultOpen={false} tint="primary" flat>
        {adminLogs.length === 0 ? (
          <p className="text-[11px] text-slate-500">No admin actions recorded yet.</p>
        ) : (
          <div className="space-y-1.5">
            {adminLogs.map((log) => (
              <ExpandableListCard
                key={log.id}
                summary={<><p className="text-[10px] font-semibold text-slate-500">{new Date(log.createdAt).toLocaleDateString()}</p><p className="truncate text-xs font-bold text-slate-900">{log.action}</p></>}
                details={<>{log.details && <p className="text-[10px] text-slate-700">{log.details}</p>}<p className="mt-1 text-[9px] text-slate-500">{new Date(log.createdAt).toLocaleString()}</p></>}
              />
            ))}
            <button type="button" onClick={() => { clearAdminLogs(); setAdminLogs([]); setToast('Admin logs cleared'); }} className="w-full rounded-xl border border-slate-200 py-2 text-[10px] font-bold text-slate-600">Clear logs</button>
          </div>
        )}
      </Section>
      <Section icon={Radio} title="Emergency Radio" tint="danger" defaultOpen={false} flat>
        <EmergencyRadio logs={radioLogs} playingId={playingRadioId} />
      </Section>
      <Section icon={CloudRain} title="Weather & Analytics" tint="primary" defaultOpen={false}>
        <WeatherTab />
      </Section>
      <Section id="admin-inbox" icon={Inbox} title="Ask Admin & Feedback" defaultOpen={false} tint="primary" flat>
        {utilityInbox.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-3 py-6 text-center text-xs text-slate-500">No questions or feedback yet.</p>
        ) : (
          <div className="space-y-2">
            {utilityInbox.map((item) => (
            <ExpandableListCard
              key={item.id}
              className={item.read ? '' : 'border-blue-200'}
              summary={<><p className="text-[10px] font-bold uppercase tracking-wide text-blue-600">{item.type === 'admin-question' ? 'Admin question' : 'Feedback'}</p><p className="truncate text-xs font-semibold text-slate-900">{item.sender} · {new Date(item.createdAt).toLocaleDateString()}</p></>}
              details={<><p className="text-[10px] leading-relaxed text-slate-700">{item.message}</p><p className="mt-1 text-[9px] text-slate-500">{new Date(item.createdAt).toLocaleString()}</p></>}
              onToggleExpand={() => setUtilityInbox(markUtilityInboxRead(item.id))}
              actions={[{ icon: Trash2, label: 'Delete', danger: true, onClick: () => setUtilityInbox(deleteUtilityInboxItem(item.id)) }]}
            />
            ))}
          </div>
        )}
      </Section>
    </>
  );

  const dockItems = [
    { id: 'overview', label: 'Overview', icon: ShieldCheck, target: 'admin-overview' },
    { id: 'accounts', label: 'Accounts', icon: Users, target: 'admin-accounts' },
    { id: 'commuter', label: 'Commuter view', icon: MapPin, onSelect: () => onViewChange?.('commuter') },
    { id: 'driver', label: 'Driver view', icon: Bus, onSelect: () => onViewChange?.('driver') },
  ];

  return (
    <AppShell brand="Admin" panel={panel} dockItems={dockItems} utilityProfile={utilityProfile} extraNavigationItems={[{ id: 'admin-accounts', title: 'Accounts', icon: Users, useCurrentScreen: true }]} open={drawerOpen} onOpenDrawer={onOpenDrawer} onCloseDrawer={onCloseDrawer} collapsed={collapsed} onToggleCollapse={onToggleCollapse}>
      <div id="admin-accounts" className="h-full scroll-m-6 overflow-y-auto bg-[var(--lo-bg)] p-3 sm:p-5">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <ScreenBackButton />
            <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
              <ShieldCheck size={20} style={{ color: 'var(--lo-primary)' }} /> Accounts
            </h2>
          </div>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-900">
            {filtered.length} / {users.length}
          </span>
        </header>

        {!firebaseReady && (
          <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-900">
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
          <div className="flex w-full flex-wrap gap-1.5">
            {['all', 'commuter', 'driver', 'admin'].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRoleFilter(r)}
                className={`min-h-11 flex-1 rounded-xl px-3 text-xs font-bold uppercase tracking-wide  ${roleFilter === r ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-white text-slate-900 '}`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          {filtered.length > 0 && (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
              <label className="flex items-center gap-2 text-[10px] font-bold text-slate-600">
                <input type="checkbox" checked={filtered.every((user) => selectedUsers.includes(user.uid))}
                  onChange={(event) => setSelectedUsers(event.target.checked ? filtered.map((user) => user.uid) : [])} />
                Select all
              </label>
              {selectedUsers.length > 0 && (
                <button type="button" onClick={() => setBulkConfirm('users')} className="flex items-center gap-1 rounded-lg bg-red-500 px-2.5 py-1.5 text-[10px] font-bold text-white">
                  <Trash2 size={12} /> Delete {selectedUsers.length}
                </button>
              )}
            </div>
          )}
          {filtered.map((user) => (
            <ExpandableListCard
              key={user.uid}
              leading={<input type="checkbox" checked={selectedUsers.includes(user.uid)} disabled={user.uid === profile?.uid}
                onChange={(event) => setSelectedUsers((current) => event.target.checked ? [...current, user.uid] : current.filter((uid) => uid !== user.uid))}
                aria-label={`Select account ${user.fullName || user.email}`} />}
              summary={<><p className="truncate text-xs font-bold text-slate-900">{user.fullName || 'User'}</p><span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${ROLE_STYLES[user.role] || ROLE_STYLES.commuter}`}>{user.role}</span></>}
              details={<dl className="space-y-1 text-[10px]"><div className="flex justify-between gap-2"><dt className="text-slate-500">Email</dt><dd className="truncate text-right text-slate-900">{user.email || '—'}</dd></div><div className="flex justify-between gap-2"><dt className="text-slate-500">Phone</dt><dd className="text-right text-slate-900">{user.phone || '—'}</dd></div><div className="flex justify-between gap-2"><dt className="text-slate-500">Active plate</dt><dd className="text-right text-slate-900">{user.activePlate || '—'}</dd></div></dl>}
              actions={[
                { icon: Users, label: 'Open account', onClick: () => setSelectedUser(user) },
                { icon: Pencil, label: 'Edit details', onClick: () => openEditor(user) },
                ...(user.uid !== profile?.uid ? [{ icon: Trash2, label: 'Delete account', danger: true, onClick: () => { setSelectedUser(user); setConfirmUid(user.uid); } }] : []),
              ]}
            />
          ))}
        </div>
      </div>

      {selectedUser && (
        <div className="fixed inset-0 z-[1900] overflow-y-auto bg-[var(--lo-bg)]">
          <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
            <div className="min-w-0">
              <p className="truncate text-lg font-extrabold text-slate-900">{selectedUser.fullName || 'User'}</p>
              <p className="text-[10px] uppercase tracking-wide text-slate-500">{selectedUser.role} account</p>
            </div>
            <button type="button" onClick={() => setSelectedUser(null)} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-500" aria-label="Close user details">
              <X size={20} />
            </button>
          </header>
          <main className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <InfoRow label="Email" value={selectedUser.email || '—'} />
                <InfoRow label="Phone" value={selectedUser.phone || '—'} />
                <InfoRow label="Role" value={selectedUser.role || 'commuter'} />
                <InfoRow label="Active plate" value={selectedUser.activePlate || '—'} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => openEditor(selectedUser)} className="flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-[11px] font-bold text-slate-700"><Pencil size={13} /> Edit details</button>
                {selectedUser.uid !== profile?.uid && <button type="button" onClick={() => setConfirmUid(confirmUid === selectedUser.uid ? '' : selectedUser.uid)} className="flex min-h-10 items-center gap-1.5 rounded-xl border border-red-200 px-3 text-[11px] font-bold text-red-600"><Trash2 size={13} /> Delete user</button>}
              </div>
              {confirmUid === selectedUser.uid && (
                <div className="mt-3 flex items-center justify-between rounded-xl bg-red-50 px-3 py-2">
                  <span className="text-[10px] font-semibold text-red-700">Delete {selectedUser.email}?</span>
                  <div className="flex gap-1.5">
                    <button type="button" onClick={() => setConfirmUid('')} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[9px] font-bold">Cancel</button>
                    <button type="button" onClick={() => removeUser(selectedUser)} className="rounded-lg bg-red-500 px-2 py-1 text-[9px] font-bold text-white">Delete</button>
                  </div>
                </div>
              )}
            </section>

            {selectedUser.role === 'commuter' && (
              <section>
                <h3 className="mb-2 text-sm font-bold text-slate-900">Recent rides <span className="text-slate-400">({rides.length})</span></h3>
                {rides.length ? <div className="space-y-2">{rides.map((ride) => (
                  <ExpandableListCard
                    key={ride.id}
                    summary={<><p className="text-[10px] font-semibold text-slate-500">{new Date(ride.time || ride.startedAt || ride.rideAt || 0).toLocaleDateString()}</p><p className="truncate text-xs font-bold text-slate-900">{ride.plate || ride.vehicleId || 'PUV'}</p></>}
                    details={<dl className="space-y-1 text-[10px]"><div className="flex justify-between gap-2"><dt className="text-slate-500">Route</dt><dd className="truncate text-right text-slate-900">{ride.routeName || ride.operatorName || 'Route'}</dd></div><div className="flex justify-between gap-2"><dt className="text-slate-500">Recorded</dt><dd className="text-right text-slate-900">{ride.time || ride.startedAt || 'Recorded ride'}</dd></div></dl>}
                    actions={[
                      { icon: Pencil, label: 'Edit ride', onClick: () => setRecordEdit({ type: 'ride', id: ride.id, values: { plate: ride.plate || ride.vehicleId || '', routeName: ride.routeName || ride.operatorName || '' } }) },
                      { icon: Trash2, label: 'Delete ride', danger: true, onClick: () => setRecordConfirm({ type: 'ride', id: ride.id }) },
                    ]}
                  />
                ))}</div> : <p className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-xs text-slate-500">No rides recorded.</p>}
              </section>
            )}

            {selectedUser.role === 'driver' && (
              <section>
                <h3 className="mb-2 text-sm font-bold text-slate-900">Trips <span className="text-slate-400">({trips.length})</span></h3>
                {trips.length ? <div className="space-y-2">{trips.map((trip) => (
                  <ExpandableListCard
                    key={trip.id}
                    summary={<><p className="text-[10px] font-semibold text-slate-500">{new Date(trip.startedAt || 0).toLocaleDateString()}</p><p className="truncate text-xs font-bold text-slate-900">{trip.vehicleId || 'PUV'}</p></>}
                    details={<dl className="space-y-1 text-[10px]"><div className="flex justify-between gap-2"><dt className="text-slate-500">Route</dt><dd className="truncate text-right text-slate-900">{trip.routeName || 'Route'}</dd></div><div className="flex justify-between gap-2"><dt className="text-slate-500">Started</dt><dd className="text-right text-slate-900">{trip.startedAt || 'Recorded trip'}</dd></div><div className="flex justify-between gap-2"><dt className="text-slate-500">Duration</dt><dd className="text-right text-slate-900">{trip.duration || 'Duration unavailable'}</dd></div></dl>}
                    actions={[
                      { icon: Pencil, label: 'Edit trip', onClick: () => setRecordEdit({ type: 'trip', id: trip.id, values: { vehicleId: trip.vehicleId || '', routeName: trip.routeName || '' } }) },
                      { icon: Trash2, label: 'Delete trip', danger: true, onClick: () => setRecordConfirm({ type: 'trip', id: trip.id }) },
                    ]}
                  />
                ))}</div> : <p className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-xs text-slate-500">No trips recorded.</p>}
              </section>
            )}
          </main>
        </div>
      )}

      {/* Edit modal */}
      <AnimatedPopup open={Boolean(editing)}>
        {editing && (
          <div role="dialog" aria-modal="true" aria-label={`Edit ${editing.email}`} className="lo-dialog-card max-h-[90dvh] w-full max-w-lg overflow-y-auto pb-[env(safe-area-inset-bottom)] sm:mx-4 sm:pb-0">
            <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
              <h3 className="text-sm font-bold text-slate-900">Edit {editing.email}</h3>
              <button type="button" onClick={() => setEditing(null)} aria-label="Close edit dialog" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-500  "><X size={20} /></button>
            </header>
            <div className="space-y-3 p-5">
              <label className="block">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Full name</span>
                <input value={draft.fullName} onChange={(e) => setDraft((d) => ({ ...d, fullName: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Mobile</span>
                <input value={draft.phone} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none" />
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Role</span>
                <select value={draft.role} onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))} className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none">
                  <option value="commuter">Commuter</option>
                  <option value="driver">Driver</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              {draft.role === 'driver' && (
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">Plate numbers (comma-separated)</span>
                  <input value={draft.plates} onChange={(e) => setDraft((d) => ({ ...d, plates: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none" />
                </label>
              )}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">New account password</span>
                  <input type="password" minLength={6} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 6 characters" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none" />
                </label>
                <button type="button" onClick={updateUserPassword} disabled={saving || newPassword.length < 6} className="mt-2 min-h-10 w-full rounded-xl bg-blue-600 px-3 text-xs font-bold text-white disabled:opacity-40">Update password</button>
              </div>
            </div>
            <footer className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
              <button type="button" onClick={() => setEditing(null)} className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-900  ">Cancel</button>
              <button type="button" onClick={saveEditor} disabled={saving} className="flex min-h-11 items-center gap-1.5 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white shadow-lg   disabled:opacity-60">
                {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                {saving ? 'Saving…' : 'Save'}
              </button>
            </footer>
          </div>
        )}
      </AnimatedPopup>

      <AnimatedPopup open={Boolean(recordConfirm)}>
        {recordConfirm && (
            <div role="dialog" aria-modal="true" aria-label="Confirm deletion" className="lo-dialog-card w-full max-w-sm p-4">
              <p className="text-sm font-bold text-slate-900">Delete this {recordConfirm.type}?</p>
              <p className="mt-1 text-[10px] text-slate-500">This action can only be undone by restoring the browser data.</p>
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setRecordConfirm(null)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold">Cancel</button>
                <button type="button" onClick={deleteRecord} className="rounded-xl bg-red-500 px-3 py-2 text-xs font-bold text-white">Delete</button>
              </div>
            </div>
        )}
      </AnimatedPopup>

      <AnimatedPopup open={Boolean(bulkConfirm)}>
        {bulkConfirm && (
            <div role="dialog" aria-modal="true" aria-label="Confirm deletion" className="lo-dialog-card w-full max-w-sm p-4">
              <p className="text-sm font-bold text-slate-900">Confirm deletion</p>
              <p className="mt-1 text-[10px] text-slate-500">Delete the selected items? This action cannot be undone.</p>
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={() => setBulkConfirm('')} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold">Cancel</button>
                <button type="button" onClick={confirmBulkDelete} className="rounded-xl bg-red-500 px-3 py-2 text-xs font-bold text-white">Delete selected</button>
              </div>
            </div>
        )}
      </AnimatedPopup>

      <AnimatedPopup open={Boolean(recordEdit)}>
        {recordEdit && (
          <div role="dialog" aria-modal="true" aria-label={`Edit ${recordEdit.type}`} className="lo-dialog-card w-full max-w-sm p-4">
            <h3 className="mb-3 text-sm font-bold text-slate-900">Edit {recordEdit.type}</h3>
            <div className="space-y-2">
              <input value={recordEdit.values.plate ?? recordEdit.values.vehicleId ?? ''} onChange={(e) => setRecordEdit((current) => ({ ...current, values: { ...current.values, plate: e.target.value, vehicleId: e.target.value } }))} placeholder="Plate number" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <input value={recordEdit.values.routeName || ''} onChange={(e) => setRecordEdit((current) => ({ ...current, values: { ...current.values, routeName: e.target.value } }))} placeholder="Route" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setRecordEdit(null)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold">Cancel</button>
              <button type="button" onClick={saveRecord} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white">Save</button>
            </div>
          </div>
        )}
      </AnimatedPopup>

      <AnimatedPopup open={Boolean(editingAnnouncement)}>
        {editingAnnouncement && (
          <div role="dialog" aria-modal="true" aria-label="Edit announcement" className="lo-dialog-card w-full max-w-sm p-4">
            <h3 className="mb-3 text-sm font-bold text-slate-900">Edit announcement</h3>
            <div className="space-y-2">
              <input value={announcementDraft.title} onChange={(e) => setAnnouncementDraft((draft) => ({ ...draft, title: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              <textarea value={announcementDraft.message} onChange={(e) => setAnnouncementDraft((draft) => ({ ...draft, message: e.target.value }))} rows={3} className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setEditingAnnouncement(null)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold">Cancel</button>
              <button type="button" onClick={saveAnnouncement} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white">Save</button>
            </div>
          </div>
        )}
      </AnimatedPopup>

      <ConfirmToast message={toast} onClose={() => setToast('')} />
    </AppShell>
  );
}
