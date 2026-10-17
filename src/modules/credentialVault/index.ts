/**
 * credentialVault/index.ts
 *
 * Zero-dependency cryptographic storage, legacy migration, and rotation
 * engine for the Credential Vault module.
 *
 * Security & Storage Architecture:
 *   1. Zero hardcoded credentials or PII in source code (empty default state).
 *   2. At-rest AES-256-GCM storage sealing (`VaultStorageEnvelope`) in
 *      `chrome.storage.local` using PBKDF2-HMAC-SHA256 (310,000 iterations,
 *      32-byte salt, 12-byte IV).
 *   3. Ephemeral unlocked session caching in `chrome.storage.session`
 *      (in-memory only; wiped automatically on browser exit or manual lock).
 *   4. Binary `.vault` ("4ntv" header) and JSON envelope export/import.
 *   5. Automatic migration of legacy `Credential[]` (main), `emailGroups` /
 *      `emailList` (EmailListManager), and `pasteEntries` / `pasteManagerItems`
 *      (PasteManager), followed by immediate scrubbing of legacy storage keys.
 */

export type AccountStatus = 'fresh' | 'active' | 'exhausted';

export interface Account {
  id: string;
  label: string;
  email: string;
  password: string;
  hidden: boolean;
  status: AccountStatus;
  lastUsed: number;
}

export interface SiteGroup {
  id: string;
  site: string;
  note: string;
  accounts: Account[];
}

/** At-rest encrypted storage envelope persisted in chrome.storage.local. */
export interface VaultStorageEnvelope {
  format: '4ndr0cookie-vault-store';
  version: 1;
  encrypted: true;
  updatedAt: number;
  kdf: {
    name: 'PBKDF2';
    hash: 'SHA-256';
    iterations: number;
    salt: string; // base64 (32 bytes)
  };
  cipher: {
    name: 'AES-256-GCM';
    iv: string; // base64 (12 bytes)
  };
  payload: string; // base64 ciphertext
}

export interface VaultLoadState {
  locked: boolean;
  sealed: boolean;
  groups: SiteGroup[];
  envelope: VaultStorageEnvelope | null;
  migratedKeysPurged: string[];
}

/* Legacy storage shapes (main / v1.0.x) */
export interface LegacyEmailEntry {
  id?: string;
  label?: string;
  email?: string;
  category?: string;
  timestamp?: number;
}

export interface LegacyEmailGroup {
  id?: string;
  name?: string;
  entries?: LegacyEmailEntry[];
}

export interface LegacyPasteEntry {
  id?: string;
  label?: string;
  value?: string;
  hidden?: boolean;
}

export interface LegacyFlatCredential {
  id?: string;
  site?: string;
  username?: string;
  password?: string;
  notes?: string;
}

export const STATUS_CYCLE: AccountStatus[] = ['fresh', 'active', 'exhausted'];

export const STATUS_LABEL: Record<AccountStatus, string> = {
  fresh: 'Fresh',
  active: 'Active',
  exhausted: 'Exhausted',
};

export const PBKDF2_ITERATIONS = 310_000;
const SALT_BYTES = 32;
const IV_BYTES = 12;
const VAULT_MAGIC = new Uint8Array([0x34, 0x6e, 0x74, 0x76]); // "4ntv"

const LEGACY_STORAGE_KEYS = [
  'emailGroups',
  'emailList',
  'pasteEntries',
  'pasteManagerItems',
] as const;

const SESSION_GROUPS_KEY = 'vaultSessionGroups';
const SESSION_PASSPHRASE_KEY = 'vaultSessionPassphrase';

/** In-memory fallback when chrome.storage.session is unavailable in test/older contexts. */
let memorySessionGroups: SiteGroup[] | null = null;
let memorySessionPassphrase: string | null = null;

export const uid = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const timeAgo = (ts: number): string => {
  if (!ts || ts <= 0) return 'never used';
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return 'used just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `used ${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `used ${h}h ago`;
  return `used ${Math.floor(h / 24)}d ago`;
};

/* ─── Normalization (handles v1.1.1 SiteGroup and main flat Credential) ─── */

export const normalizeAccount = (
  raw: Partial<Account> & { username?: string },
): Account => ({
  id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
  label: typeof raw.label === 'string' ? raw.label : '',
  email:
    typeof raw.email === 'string'
      ? raw.email
      : typeof raw.username === 'string'
        ? raw.username
        : '',
  password: typeof raw.password === 'string' ? raw.password : '',
  hidden: typeof raw.hidden === 'boolean' ? raw.hidden : true,
  status:
    raw.status === 'active' || raw.status === 'exhausted' ? raw.status : 'fresh',
  lastUsed: typeof raw.lastUsed === 'number' && Number.isFinite(raw.lastUsed) ? raw.lastUsed : 0,
});

export const normalizeGroup = (
  raw: Partial<SiteGroup> & LegacyFlatCredential,
): SiteGroup => {
  if (Array.isArray(raw.accounts)) {
    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
      site: typeof raw.site === 'string' ? raw.site : '',
      note:
        typeof raw.note === 'string'
          ? raw.note
          : typeof raw.notes === 'string'
            ? raw.notes
            : '',
      accounts: raw.accounts.map((a) => normalizeAccount(a)),
    };
  }

  // Legacy flat Credential shape from main branch ({ id, site, username, password, notes })
  if (typeof raw.username === 'string' || typeof raw.password === 'string') {
    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
      site: typeof raw.site === 'string' ? raw.site : 'imported',
      note: typeof raw.notes === 'string' ? raw.notes : typeof raw.note === 'string' ? raw.note : '',
      accounts: [
        normalizeAccount({
          id: typeof raw.id === 'string' && raw.id ? `${raw.id}-0` : uid(),
          label: '',
          email: raw.username ?? '',
          password: raw.password ?? '',
          hidden: true,
          status: 'fresh',
          lastUsed: 0,
        }),
      ],
    };
  }

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
    site: typeof raw.site === 'string' ? raw.site : '',
    note: typeof raw.note === 'string' ? raw.note : '',
    accounts: [],
  };
};

export const normalizeGroupList = (raw: unknown): SiteGroup[] => {
  if (!Array.isArray(raw)) return [];
  // Consolidate legacy flat credentials sharing the same site while preserving SiteGroup order
  const out: SiteGroup[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const isFlat = !Array.isArray((item as SiteGroup).accounts) &&
      ('username' in item || 'password' in item);
    const normalized = normalizeGroup(item as Partial<SiteGroup> & LegacyFlatCredential);
    if (isFlat && normalized.site) {
      const existing = out.find((g) => g.site === normalized.site);
      if (existing) {
        existing.accounts.push(...normalized.accounts);
        if (!existing.note && normalized.note) existing.note = normalized.note;
        continue;
      }
    }
    out.push(normalized);
  }
  return out;
};

/* ─── Text import parser (deterministic colon grammar, lossless passwords) ─── */

export const parseAccountLine = (
  line: string,
): Omit<Account, 'id' | 'hidden' | 'status' | 'lastUsed'> | null => {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const firstColon = trimmed.indexOf(':');
  if (firstColon === -1) {
    // Bare email line
    if (trimmed.includes('@')) {
      return { label: '', email: trimmed, password: '' };
    }
    return null;
  }

  const firstPart = trimmed.slice(0, firstColon).trim();
  const restAfterFirst = trimmed.slice(firstColon + 1).trim();

  if (firstPart.includes('@')) {
    // "email: password" (password may itself contain colons and spaces)
    return { label: '', email: firstPart, password: restAfterFirst };
  }

  const secondColon = restAfterFirst.indexOf(':');
  if (secondColon === -1) {
    // Two segments: either "label: email" or legacy PasteManager "label: secret"
    if (!firstPart && !restAfterFirst) return null;
    if (restAfterFirst.includes('@')) {
      return { label: firstPart, email: restAfterFirst, password: '' };
    }
    // Legacy PasteManager non-email key/value entry
    if (firstPart && restAfterFirst) {
      return { label: firstPart, email: firstPart, password: restAfterFirst };
    }
    return null;
  }

  const secondPart = restAfterFirst.slice(0, secondColon).trim();
  const passwordPart = restAfterFirst.slice(secondColon + 1).trim();

  if (!secondPart) return null;
  return {
    label: firstPart,
    email: secondPart,
    password: passwordPart,
  };
};

/* ─── Deduplicating group/account merge ─── */

export const mergeImportedGroups = (
  existing: SiteGroup[],
  incoming: SiteGroup[],
): { groups: SiteGroup[]; addedGroups: number; addedAccounts: number } => {
  const merged = existing.map((g) => ({
    ...g,
    accounts: g.accounts.map((a) => ({ ...a })),
  }));
  let addedGroups = 0;
  let addedAccounts = 0;

  for (const rawGroup of incoming) {
    const ng = normalizeGroup(rawGroup);
    const match = merged.find((g) => g.site === ng.site && ng.site !== '');
    if (match) {
      if (!match.note && ng.note) match.note = ng.note;
      for (const na of ng.accounts) {
        const key = na.email || na.label;
        if (!key) continue;
        const dup = match.accounts.find((ea) =>
          na.email ? ea.email === na.email : ea.label === na.label,
        );
        if (!dup) {
          match.accounts.push(na);
          addedAccounts++;
        } else if (!dup.password && na.password) {
          dup.password = na.password;
        }
      }
    } else {
      merged.push(ng);
      addedGroups++;
      addedAccounts += ng.accounts.length;
    }
  }

  return { groups: merged, addedGroups, addedAccounts };
};

/* ─── Base64 & Web Crypto primitives (AES-256-GCM + PBKDF2 310k) ─── */

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};

const fromBase64 = (text: string): Uint8Array => {
  const binary = atob(text.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

export async function deriveVaultKey(
  password: string,
  salt: Uint8Array,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<CryptoKey> {
  if (!password) {
    throw new Error('Vault password is required.');
  }
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypt SiteGroup[] into the binary .vault ("4ntv") format:
 *   4-byte magic ("4ntv") | 32-byte salt | 12-byte iv | AES-256-GCM ciphertext
 */
export async function encryptVaultBinary(
  data: SiteGroup[],
  password: string,
): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveVaultKey(password, salt, PBKDF2_ITERATIONS);
  const plain = new TextEncoder().encode(JSON.stringify(data));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    plain as BufferSource,
  );

  const out = new Uint8Array(4 + SALT_BYTES + IV_BYTES + cipher.byteLength);
  out.set(VAULT_MAGIC, 0);
  out.set(salt, 4);
  out.set(iv, 4 + SALT_BYTES);
  out.set(new Uint8Array(cipher), 4 + SALT_BYTES + IV_BYTES);
  return out;
}

export async function encryptVaultBlob(
  data: SiteGroup[],
  password: string,
): Promise<Blob> {
  const bytes = await encryptVaultBinary(data, password);
  return new Blob([bytes as BlobPart], { type: 'application/octet-stream' });
}

/**
 * Decrypt a .vault file (supports both binary "4ntv" files and JSON
 * VaultStorageEnvelope files).
 */
export async function decryptVaultBinary(
  buffer: ArrayBuffer | Uint8Array,
  password: string,
): Promise<SiteGroup[]> {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (data.length === 0) throw new Error('Invalid vault file');

  // Check for "4ntv" binary header
  if (
    data.length > 4 + SALT_BYTES + IV_BYTES &&
    data[0] === VAULT_MAGIC[0] &&
    data[1] === VAULT_MAGIC[1] &&
    data[2] === VAULT_MAGIC[2] &&
    data[3] === VAULT_MAGIC[3]
  ) {
    const salt = data.slice(4, 4 + SALT_BYTES);
    const iv = data.slice(4 + SALT_BYTES, 4 + SALT_BYTES + IV_BYTES);
    const cipher = data.slice(4 + SALT_BYTES + IV_BYTES);
    const key = await deriveVaultKey(password, salt, PBKDF2_ITERATIONS);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      cipher as BufferSource,
    );
    const parsed = JSON.parse(new TextDecoder().decode(plain));
    if (!Array.isArray(parsed)) throw new Error('Invalid vault payload');
    return normalizeGroupList(parsed);
  }

  // Fallback: check if file is a JSON VaultStorageEnvelope
  const text = new TextDecoder().decode(data).trim();
  if (text.startsWith('{')) {
    const parsed = JSON.parse(text);
    if (isVaultEnvelope(parsed)) {
      return unsealVaultStorage(parsed, password);
    }
  }

  throw new Error('Invalid vault file');
}

/* ─── At-Rest Storage Envelope (chrome.storage.local encryption) ─── */

export const isVaultEnvelope = (raw: unknown): raw is VaultStorageEnvelope => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const env = raw as Partial<VaultStorageEnvelope>;
  return (
    env.format === '4ndr0cookie-vault-store' &&
    env.version === 1 &&
    env.encrypted === true &&
    typeof env.payload === 'string' &&
    typeof env.kdf?.salt === 'string' &&
    typeof env.cipher?.iv === 'string'
  );
};

export async function sealVaultStorage(
  groups: SiteGroup[],
  passphrase: string,
): Promise<VaultStorageEnvelope> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveVaultKey(passphrase, salt, PBKDF2_ITERATIONS);
  const plain = new TextEncoder().encode(JSON.stringify(groups));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    plain as BufferSource,
  );

  return {
    format: '4ndr0cookie-vault-store',
    version: 1,
    encrypted: true,
    updatedAt: Date.now(),
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: PBKDF2_ITERATIONS,
      salt: toBase64(salt),
    },
    cipher: {
      name: 'AES-256-GCM',
      iv: toBase64(iv),
    },
    payload: toBase64(new Uint8Array(cipher)),
  };
}

export async function unsealVaultStorage(
  envelope: VaultStorageEnvelope,
  passphrase: string,
): Promise<SiteGroup[]> {
  if (!isVaultEnvelope(envelope)) {
    throw new Error('Malformed vault storage envelope.');
  }
  const salt = fromBase64(envelope.kdf.salt);
  const iv = fromBase64(envelope.cipher.iv);
  const cipher = fromBase64(envelope.payload);
  const iterations = envelope.kdf.iterations || PBKDF2_ITERATIONS;
  const key = await deriveVaultKey(passphrase, salt, iterations);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    cipher as BufferSource,
  );
  const decoded = JSON.parse(new TextDecoder().decode(plain));
  if (!Array.isArray(decoded)) {
    throw new Error('Decrypted vault storage payload is not an array.');
  }
  return normalizeGroupList(decoded);
}

/* ─── Ephemeral Session Cache (chrome.storage.session + memory fallback) ─── */

const getSessionStore = (): chrome.storage.StorageArea | null => {
  if (typeof chrome !== 'undefined' && chrome.storage && 'session' in chrome.storage) {
    return (chrome.storage as typeof chrome.storage & { session?: chrome.storage.StorageArea }).session ?? null;
  }
  return null;
};

export async function getSessionVaultCache(): Promise<{
  groups: SiteGroup[] | null;
  passphrase: string | null;
}> {
  const sessionStore = getSessionStore();
  if (sessionStore) {
    try {
      const res = await sessionStore.get([SESSION_GROUPS_KEY, SESSION_PASSPHRASE_KEY]);
      const groups = Array.isArray(res[SESSION_GROUPS_KEY])
        ? normalizeGroupList(res[SESSION_GROUPS_KEY])
        : memorySessionGroups;
      const passphrase =
        typeof res[SESSION_PASSPHRASE_KEY] === 'string'
          ? (res[SESSION_PASSPHRASE_KEY] as string)
          : memorySessionPassphrase;
      return { groups, passphrase };
    } catch {
      return { groups: memorySessionGroups, passphrase: memorySessionPassphrase };
    }
  }
  return { groups: memorySessionGroups, passphrase: memorySessionPassphrase };
}

export async function setSessionVaultCache(
  groups: SiteGroup[] | null,
  passphrase: string | null,
): Promise<void> {
  memorySessionGroups = groups;
  memorySessionPassphrase = passphrase;
  const sessionStore = getSessionStore();
  if (sessionStore) {
    try {
      if (groups === null && passphrase === null) {
        await sessionStore.remove([SESSION_GROUPS_KEY, SESSION_PASSPHRASE_KEY]);
      } else {
        await sessionStore.set({
          [SESSION_GROUPS_KEY]: groups,
          [SESSION_PASSPHRASE_KEY]: passphrase,
        });
      }
    } catch {
      // Fallback remains in memorySessionGroups
    }
  }
}

export async function clearSessionVaultCache(): Promise<void> {
  await setSessionVaultCache(null, null);
}

/* ─── Legacy Migration Helpers ─── */

export const migrateLegacyRecords = (
  rawStorage: Record<string, unknown>,
): { migrated: SiteGroup[]; keysToPurge: string[] } => {
  const migrated: SiteGroup[] = [];
  const keysToPurge: string[] = [];

  // 1. v1.0.1 emailGroups: [{ id, name, entries: [{ id, label, email, timestamp }] }]
  if (Array.isArray(rawStorage.emailGroups)) {
    keysToPurge.push('emailGroups');
    for (const g of rawStorage.emailGroups as LegacyEmailGroup[]) {
      if (!g || typeof g !== 'object') continue;
      migrated.push({
        id: g.id || uid(),
        site: g.name || 'imported',
        note: '',
        accounts: Array.isArray(g.entries)
          ? g.entries.map((e) => ({
              id: e.id || uid(),
              label: e.label || '',
              email: e.email || '',
              password: '',
              hidden: true,
              status: 'fresh',
              lastUsed: typeof e.timestamp === 'number' ? e.timestamp : 0,
            }))
          : [],
      });
    }
  }

  // 2. main branch emailList: [{ id, email, category }]
  if (Array.isArray(rawStorage.emailList)) {
    keysToPurge.push('emailList');
    const byCat = new Map<string, Account[]>();
    for (const e of rawStorage.emailList as LegacyEmailEntry[]) {
      if (!e || typeof e !== 'object' || !e.email) continue;
      const cat = e.category || 'imported';
      const list = byCat.get(cat) ?? [];
      list.push({
        id: e.id || uid(),
        label: e.label || '',
        email: e.email,
        password: '',
        hidden: true,
        status: 'fresh',
        lastUsed: typeof e.timestamp === 'number' ? e.timestamp : 0,
      });
      byCat.set(cat, list);
    }
    for (const [site, accounts] of byCat.entries()) {
      migrated.push({ id: uid(), site, note: '', accounts });
    }
  }

  // 3. PasteManager pasteEntries / pasteManagerItems: [{ id, label, value, hidden }]
  for (const key of ['pasteEntries', 'pasteManagerItems'] as const) {
    if (Array.isArray(rawStorage[key])) {
      keysToPurge.push(key);
      for (const e of rawStorage[key] as LegacyPasteEntry[]) {
        if (!e || typeof e !== 'object') continue;
        const val = typeof e.value === 'string' ? e.value : '';
        const isEmail = val.includes('@');
        migrated.push({
          id: e.id || uid(),
          site: e.label || 'imported',
          note: '',
          accounts: [
            {
              id: uid(),
              label: e.label || '',
              email: isEmail ? val : e.label || '',
              password: isEmail ? '' : val,
              hidden: typeof e.hidden === 'boolean' ? e.hidden : true,
              status: 'fresh',
              lastUsed: 0,
            },
          ],
        });
      }
    }
  }

  return { migrated, keysToPurge };
};

/* ─── High-Level Storage Orchestration ─── */

export async function loadVaultFromStorage(): Promise<VaultLoadState> {
  const keys = ['credentialVault', ...LEGACY_STORAGE_KEYS];
  const raw = await chrome.storage.local.get(keys);

  const { migrated, keysToPurge } = migrateLegacyRecords(raw);

  // Case 1: Sealed VaultStorageEnvelope at rest
  if (isVaultEnvelope(raw.credentialVault)) {
    if (keysToPurge.length > 0) {
      await chrome.storage.local.remove(keysToPurge);
    }
    const session = await getSessionVaultCache();
    if (session.groups !== null) {
      return {
        locked: false,
        sealed: true,
        groups: session.groups,
        envelope: raw.credentialVault,
        migratedKeysPurged: keysToPurge,
      };
    }
    return {
      locked: true,
      sealed: true,
      groups: [],
      envelope: raw.credentialVault,
      migratedKeysPurged: keysToPurge,
    };
  }

  // Case 2: Existing unsealed array in credentialVault
  if (Array.isArray(raw.credentialVault) && raw.credentialVault.length > 0) {
    let groups = normalizeGroupList(raw.credentialVault);
    if (migrated.length > 0) {
      groups = mergeImportedGroups(groups, migrated).groups;
    }
    if (keysToPurge.length > 0) {
      await chrome.storage.local.set({ credentialVault: groups });
      await chrome.storage.local.remove(keysToPurge);
    }
    return {
      locked: false,
      sealed: false,
      groups,
      envelope: null,
      migratedKeysPurged: keysToPurge,
    };
  }

  // Case 3: Legacy migration only
  if (migrated.length > 0) {
    const deduped = mergeImportedGroups([], migrated).groups;
    await chrome.storage.local.set({ credentialVault: deduped });
    if (keysToPurge.length > 0) {
      await chrome.storage.local.remove(keysToPurge);
    }
    return {
      locked: false,
      sealed: false,
      groups: deduped,
      envelope: null,
      migratedKeysPurged: keysToPurge,
    };
  }

  // Case 4: Clean empty initialization (zero hardcoded credentials)
  if (keysToPurge.length > 0) {
    await chrome.storage.local.remove(keysToPurge);
  }
  await chrome.storage.local.set({ credentialVault: [] });
  return {
    locked: false,
    sealed: false,
    groups: [],
    envelope: null,
    migratedKeysPurged: keysToPurge,
  };
}

export async function saveVaultToStorage(
  groups: SiteGroup[],
  options?: { sealed?: boolean; passphrase?: string | null },
): Promise<VaultStorageEnvelope | null> {
  const session = await getSessionVaultCache();
  const effectivePassphrase = options?.passphrase ?? session.passphrase;
  const shouldSeal = options?.sealed ?? Boolean(effectivePassphrase);

  if (shouldSeal && effectivePassphrase) {
    const envelope = await sealVaultStorage(groups, effectivePassphrase);
    await chrome.storage.local.set({ credentialVault: envelope });
    await setSessionVaultCache(groups, effectivePassphrase);
    return envelope;
  }

  await chrome.storage.local.set({ credentialVault: groups });
  return null;
}
