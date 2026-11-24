/**
 * Opt-in encrypted token lock, kept in IndexedDB for LOCK_EXPIRY_MS.
 *
 * Each "slot" holds one secret (a PAT, or Jira credentials as JSON) plus a
 * little non-secret metadata (organization, Jira site). Every slot has its own
 * non-extractable AES-GCM-256 key, so clearing one never touches another.
 *
 * What this protects: the token survives a page refresh without ever being
 * written to disk in plain text. What it can't protect against: script running
 * on this site can still ask the browser to decrypt it while it's locked.
 * That's why the app ships a strict Content-Security-Policy.
 */

const DB_NAME = 'tooldock-vault';
const DB_VERSION = 1;
const STORE_NAME = 'vault';

/** How long a lock lasts. The single source of truth for every lock timer. */
export const LOCK_EXPIRY_MS = 30 * 60 * 1000;

export type VaultSlot = 'tools' | 'mig-source' | 'mig-target' | 'mig-jira';

type Meta = Record<string, string>;

interface SecretRecord {
  id: string;
  ciphertext: ArrayBuffer;
  iv: Uint8Array;
  lockedAt: number;
  /** Tools slot only (kept for records saved before slots existed). */
  organization?: string;
  meta?: Meta;
}

interface KeyRecord {
  id: string;
  key: CryptoKey;
}

/** The tools slot keeps the original record ids so existing locks still load. */
function recordIds(slot: VaultSlot): { secret: string; key: string } {
  return slot === 'tools'
    ? { secret: 'pat', key: 'key' }
    : { secret: `${slot}:secret`, key: `${slot}:key` };
}

function openVaultDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet<T>(db: IDBDatabase, id: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, record: SecretRecord | KeyRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function idbDelete(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function wipe(db: IDBDatabase, slot: VaultSlot): Promise<void> {
  const ids = recordIds(slot);
  await idbDelete(db, ids.secret);
  await idbDelete(db, ids.key);
}

/** Encrypt `secret` into `slot`. The plaintext never touches disk. */
export async function lockSecret(
  slot: VaultSlot,
  secret: string,
  meta: Meta = {},
): Promise<{ lockedAt: number }> {
  const db = await openVaultDb();
  const ids = recordIds(slot);

  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(secret),
  );
  const lockedAt = Date.now();

  await idbPut(db, { id: ids.key, key });
  await idbPut(db, {
    id: ids.secret,
    ciphertext,
    iv,
    lockedAt,
    meta,
    ...(slot === 'tools' && meta.organization ? { organization: meta.organization } : {}),
  });
  db.close();
  return { lockedAt };
}

/** Delete the slot's secret and key. Called on unlock, disconnect and expiry. */
export async function unlockSecret(slot: VaultSlot): Promise<void> {
  try {
    const db = await openVaultDb();
    await wipe(db, slot);
    db.close();
  } catch {
    // Best effort - if IndexedDB fails here the data is unreadable anyway.
  }
}

/**
 * On page load: decrypt the slot if it holds an unexpired lock.
 * Returns null (and wipes the slot) when expired or inconsistent.
 * Resets lockedAt to now, so the 30-minute window restarts from this load.
 */
export async function loadLockedSecret(
  slot: VaultSlot,
): Promise<{ secret: string; meta: Meta; lockedAt: number } | null> {
  const db = await openVaultDb();
  const ids = recordIds(slot);

  const record = await idbGet<SecretRecord>(db, ids.secret);
  if (!record) {
    db.close();
    return null;
  }

  if (Date.now() - record.lockedAt > LOCK_EXPIRY_MS) {
    await wipe(db, slot);
    db.close();
    return null;
  }

  const keyRecord = await idbGet<KeyRecord>(db, ids.key);
  if (!keyRecord) {
    await wipe(db, slot);
    db.close();
    return null;
  }

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(record.iv) },
    keyRecord.key,
    record.ciphertext,
  );

  const lockedAt = Date.now();
  await idbPut(db, { ...record, lockedAt });
  db.close();

  const meta: Meta = { ...(record.meta ?? {}) };
  if (record.organization && !meta.organization) meta.organization = record.organization;
  return { secret: new TextDecoder().decode(plaintext), meta, lockedAt };
}

// ── Tools-mode wrappers (unchanged call sites) ──────────────────────────────

export function lockPat(pat: string, organization: string): Promise<{ lockedAt: number }> {
  return lockSecret('tools', pat, { organization });
}

export function unlockPat(): Promise<void> {
  return unlockSecret('tools');
}

export async function loadLockedPat(): Promise<{
  pat: string;
  organization: string;
  lockedAt: number;
} | null> {
  const loaded = await loadLockedSecret('tools');
  if (!loaded) return null;
  return {
    pat: loaded.secret,
    organization: loaded.meta.organization ?? '',
    lockedAt: loaded.lockedAt,
  };
}
