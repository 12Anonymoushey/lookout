import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db, firebaseReady } from './firebase.js';

const COLLECTION = 'analyticsRecords';

function documentId(uid, type, recordId) {
  return `${uid}_${type}_${encodeURIComponent(String(recordId))}`;
}

function fromSnapshot(snapshot, adminView = false) {
  const data = snapshot.data();
  const recordId = String(data.recordId ?? data.id ?? snapshot.id);
  return {
    ...data,
    id: adminView ? snapshot.id : recordId,
    recordId,
    firestoreId: snapshot.id,
  };
}

function recordTimestamp(record) {
  for (const value of [record.startedAtMs, record.rideAt, record.endedAt, record.startedAt]) {
    if (typeof value === 'number') return value;
    if (typeof value?.toMillis === 'function') return value.toMillis();
    const parsed = Date.parse(value || '');
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function watchOwnAnalyticsRecords(uid, onNext, onError) {
  if (!firebaseReady || !uid) return () => {};
  const records = query(collection(db, COLLECTION), where('ownerUid', '==', uid));
  return onSnapshot(
    records,
    (snapshot) => onNext(snapshot.docs.map((entry) => fromSnapshot(entry)).sort((a, b) => recordTimestamp(b) - recordTimestamp(a))),
    onError,
  );
}

export function watchAllAnalyticsRecords(onNext, onError) {
  if (!firebaseReady) return () => {};
  return onSnapshot(
    collection(db, COLLECTION),
    (snapshot) => onNext(snapshot.docs.map((entry) => fromSnapshot(entry, true)).sort((a, b) => recordTimestamp(b) - recordTimestamp(a))),
    onError,
  );
}

export async function saveAnalyticsRecord(uid, recordType, record) {
  if (!firebaseReady) throw new Error('Firebase is not configured.');
  if (!uid || !['trip', 'ride'].includes(recordType)) throw new Error('Analytics record owner or type is invalid.');
  const recordId = record.recordId ?? record.id;
  if (recordId == null || String(recordId).trim() === '') throw new Error('Analytics record ID is required.');

  const firestoreId = record.firestoreId || documentId(uid, recordType, recordId);
  const data = {
    ...record,
    id: String(recordId),
    recordId: String(recordId),
    recordType,
    ownerUid: uid,
    updatedAt: serverTimestamp(),
  };
  delete data.firestoreId;
  await setDoc(doc(db, COLLECTION, firestoreId), data, { merge: true });
}

export async function deleteAnalyticsRecord(record) {
  if (!firebaseReady) throw new Error('Firebase is not configured.');
  if (!record.ownerUid || !record.recordType) return;
  const firestoreId = record.firestoreId || documentId(
    record.ownerUid,
    record.recordType,
    record.recordId ?? record.id,
  );
  await deleteDoc(doc(db, COLLECTION, firestoreId));
}

export function mergeOwnedAnalyticsRecords(current, cloud, uid) {
  const cloudIds = new Set(cloud.map((record) => String(record.recordId ?? record.id)));
  const localOnly = current.filter((record) =>
    !record.ownerUid
    || (record.ownerUid === uid && !record.firestoreId && !cloudIds.has(String(record.recordId ?? record.id))),
  );
  return [...cloud, ...localOnly];
}

export function mergeLocalAndCloudAnalytics(local, cloud) {
  const cloudIds = new Set(cloud.map((record) => record.firestoreId));
  const cloudKeys = new Set(cloud.map((record) =>
    `${record.ownerUid}:${record.recordType}:${record.recordId}`,
  ));
  const localOnly = local.filter((record) =>
    !cloudIds.has(record.firestoreId)
    && (!record.ownerUid || !cloudKeys.has(`${record.ownerUid}:${record.recordType}:${record.recordId ?? record.id}`)),
  );
  return [...cloud, ...localOnly];
}
