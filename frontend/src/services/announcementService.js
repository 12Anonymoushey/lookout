/**
 * Announcements service — localStorage-based CRUD.
 * Drivers create/edit/delete their own announcements.
 * Commuters see all announcements.
 */

const STORAGE_KEY = 'lo_announcements';

function readAll() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}

function writeAll(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

/** Create a new announcement. Returns the created object. */
export function createAnnouncement({ driverUid, driverName, plate, title, message }) {
  const all = readAll();
  const entry = {
    id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
    driverUid,
    driverName,
    plate,
    title: title.trim(),
    message: message.trim(),
    createdAt: new Date().toLocaleString(),
    updatedAt: new Date().toLocaleString(),
  };
  all.unshift(entry);
  writeAll(all);
  return entry;
}

/** Update an announcement (only by the owning driver). Returns the updated object or null. */
export function updateAnnouncement(id, patch) {
  const all = readAll();
  const idx = all.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  all[idx] = { ...all[idx], ...patch, updatedAt: new Date().toLocaleString() };
  writeAll(all);
  return all[idx];
}

/** Delete an announcement (only by the owning driver). */
export function deleteAnnouncement(id) {
  const all = readAll().filter((a) => a.id !== id);
  writeAll(all);
}

/** Get all announcements (newest first). */
export function getAllAnnouncements() {
  return readAll();
}

/** Get announcements by a specific driver. */
export function getDriverAnnouncements(driverUid) {
  return readAll().filter((a) => a.driverUid === driverUid);
}
