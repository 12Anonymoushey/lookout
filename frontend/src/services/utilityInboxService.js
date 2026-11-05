const STORAGE_KEY = 'lo_admin_inbox';

export function getUtilityInbox() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function addUtilityInboxItem({ type, message, sender }) {
  const item = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    message: String(message || '').trim().slice(0, 2000),
    sender: sender || 'LookOut! user',
    createdAt: new Date().toISOString(),
    read: false,
  };
  if (!item.message) return null;
  const next = [item, ...getUtilityInbox()].slice(0, 200);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event('lookout-utility-inbox-updated'));
  return item;
}

export function markUtilityInboxRead(id) {
  const next = getUtilityInbox().map((item) => item.id === id ? { ...item, read: true } : item);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event('lookout-utility-inbox-updated'));
  return next;
}

export function deleteUtilityInboxItem(id) {
  const next = getUtilityInbox().filter((item) => item.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event('lookout-utility-inbox-updated'));
  return next;
}
