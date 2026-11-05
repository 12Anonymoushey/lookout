const STORAGE_KEY = 'lo_admin_logs';

export function getAdminLogs() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}

export function addAdminLog(action, details = '') {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    action,
    details,
    createdAt: new Date().toISOString(),
  };
  const next = [entry, ...getAdminLogs()].slice(0, 200);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return entry;
}

export function clearAdminLogs() {
  localStorage.setItem(STORAGE_KEY, '[]');
}
