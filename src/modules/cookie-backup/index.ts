/**
 * cookie-backup/index.ts
 *
 * System-wide cookie backup pipeline — sanitization, encryption, and
 * restoration primitives shared by CookieBackupManager.
 *
 * Work-order directives implemented here:
 *   Alpha — Export sanitization layer (ephemeral token / telemetry purge)
 *   Beta  — Native Web Crypto: PBKDF2 (SHA-256) → AES-256-GCM
 *   Gamma — Restoration hardening (URL synthesis, storeId validation)
 *
 * Envelope format (v2, JSON):
 *   { format, version, created, kdf: { name, hash, iterations, salt },
 *     cipher: { name, iv }, payload }                — all binary fields base64
 *
 * Legacy format (v1.0.x, still restorable):
 *   base64( salt[16] | iv[12] | AES-256-GCM ciphertext ), PBKDF2 100k iterations
 */

/* ─── Errors ─── */

export class PasswordRequiredError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'PasswordRequiredError';
  }
}

export class UnsupportedBackupFormatError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'UnsupportedBackupFormatError';
  }
}

/* ─── Types ─── */

/** Canonical serialized cookie shape — mirrors the chrome.cookies.Cookie record. */
export type SerializedCookie = chrome.cookies.Cookie;

/** v2 JSON envelope produced by `encryptBackup`. */
export interface BackupEnvelope {
  format: '4ndr0cookie-backup';
  version: 2;
  created: string;
  kdf: {
    name: 'PBKDF2';
    hash: 'SHA-256';
    iterations: number;
    salt: string; // base64
  };
  cipher: {
    name: 'AES-256-GCM';
    iv: string; // base64
  };
  payload: string; // base64 ciphertext
}

/** Result of the Alpha sanitization matrix. */
export interface SanitizeReport {
  retained: number;
  dropped: number;
  droppedNames: string[]; // deduplicated cookie names, for UI visibility
}

/* ─── Directive Alpha: export sanitization matrix ─── */

/**
 * Ephemeral / telemetry signatures that must not enter a long-term
 * recovery baseline. They are re-issued on first request after restore,
 * so retaining them only pollutes the backup (and, for sliding-window
 * auth tickets, can actively break restored sessions).
 */
const SANITIZE_MATRIX: RegExp[] = [
  // Cloudflare / bot-detection transit tokens
  /^__cf_bm$/i,
  /^_cfuvid$/i,
  /^__cflb$/i,
  /^_dd_s$/i,
  /^_abck$/i,
  // Sliding-window auth timestamp tickets
  /^__Secure-1PSIDTS$/i,
  /^__Secure-3PSIDTS$/i,
  // Analytics / telemetry signatures
  /^_ga/i,
  /^_gid$/i,
  /^_gcl_/i,
  /^sensorsdata/i,
  /^sajssdk/i,
  /^_v-/i,
];

const isSanitary = (name: string): boolean =>
  !SANITIZE_MATRIX.some((pattern) => pattern.test(name));

/**
 * Intercept a `chrome.cookies.getAll()` array before serialization.
 * Core authentication tokens always pass through untouched.
 */
export const sanitizeCookies = (
  cookies: SerializedCookie[],
): { cookies: SerializedCookie[]; report: SanitizeReport } => {
  const retained: SerializedCookie[] = [];
  const droppedNames = new Set<string>();

  for (const cookie of cookies) {
    if (isSanitary(cookie.name)) {
      retained.push(cookie);
    } else {
      droppedNames.add(cookie.name);
    }
  }

  return {
    cookies: retained,
    report: {
      retained: retained.length,
      dropped: cookies.length - retained.length,
      droppedNames: [...droppedNames],
    },
  };
};

/* ─── Directive Beta: native Web Crypto (AES-256-GCM + PBKDF2) ─── */

const ITERATIONS_V2 = 310_000;
const ITERATIONS_LEGACY_V1 = 100_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

const encoder = (): TextEncoder => new TextEncoder();
const decoder = (): TextDecoder => new TextDecoder();

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

const deriveKey = async (
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> => {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder().encode(password),
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
};

/**
 * Encrypt a sanitized cookie payload into the v2 JSON envelope.
 * Envelope carries the IV, the salt and the ciphertext together.
 */
export const encryptBackup = async (
  cookies: SerializedCookie[],
  password: string,
): Promise<string> => {
  if (!password) throw new PasswordRequiredError('Password is required for encrypted backups.');

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(password, salt, ITERATIONS_V2);
  const plain = encoder().encode(JSON.stringify(cookies));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    plain as BufferSource,
  );

  const envelope: BackupEnvelope = {
    format: '4ndr0cookie-backup',
    version: 2,
    created: new Date().toISOString(),
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: ITERATIONS_V2,
      salt: toBase64(salt),
    },
    cipher: { name: 'AES-256-GCM', iv: toBase64(iv) },
    payload: toBase64(new Uint8Array(cipher)),
  };

  return JSON.stringify(envelope, null, 2);
};

const decryptWith = async (
  salt: Uint8Array,
  iv: Uint8Array,
  cipher: Uint8Array,
  password: string,
  iterations: number,
): Promise<string> => {
  const key = await deriveKey(password, salt, iterations);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    cipher as BufferSource,
  );
  return decoder().decode(plain);
};

/** Validate a decoded payload is a minimally shaped cookie array. */
const validateCookieArray = (parsed: unknown): SerializedCookie[] => {
  if (!Array.isArray(parsed)) {
    throw new Error('Backup payload is not a cookie array.');
  }
  return parsed.map((entry) => {
    if (!entry || typeof entry !== 'object' || typeof (entry as SerializedCookie).name !== 'string') {
      throw new Error('Backup payload contains malformed cookie entries.');
    }
    return entry as SerializedCookie;
  });
};

/**
 * Decrypt a backup file. Supports:
 *   - v2 JSON envelope (current export format)
 *   - v1.0.x raw base64 (salt | iv | ciphertext, 100k iterations)
 *   - Rejects the interim crypto-js format ("U2FsdGVkX1…") with a clear error.
 */
export const decryptBackup = async (
  raw: string,
  password: string,
): Promise<SerializedCookie[]> => {
  if (!password) throw new PasswordRequiredError('Password is required for encrypted backups.');

  const text = raw.trim();

  // v2 JSON envelope
  if (text.startsWith('{')) {
    let envelope: BackupEnvelope;
    try {
      envelope = JSON.parse(text) as BackupEnvelope;
    } catch {
      throw new Error('Failed to parse backup file. Ensure it is a valid .4nt backup.');
    }
    if (
      envelope?.format !== '4ndr0cookie-backup' ||
      !envelope.kdf?.salt ||
      !envelope.cipher?.iv ||
      typeof envelope.payload !== 'string'
    ) {
      throw new Error('Unrecognized .4nt envelope structure.');
    }
    try {
      const plain = await decryptWith(
        fromBase64(envelope.kdf.salt),
        fromBase64(envelope.cipher.iv),
        fromBase64(envelope.payload),
        password,
        envelope.kdf.iterations || ITERATIONS_V2,
      );
      return validateCookieArray(JSON.parse(plain));
    } catch {
      throw new Error('Decryption failed. Incorrect password or corrupted file.');
    }
  }

  // Interim crypto-js format (unstable builds only) — explicit rejection
  if (text.startsWith('U2FsdGVkX1')) {
    throw new UnsupportedBackupFormatError(
      'This .4nt file uses the interim crypto-js format from an unstable build. ' +
        'Re-create the backup with v1.0.1 or later (legacy v1.0.x files remain supported).',
    );
  }

  // v1.0.x raw base64: salt[16] | iv[12] | ciphertext
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(text)) {
    try {
      const bytes = fromBase64(text);
      if (bytes.length <= SALT_BYTES + IV_BYTES) {
        throw new Error('truncated');
      }
      const plain = await decryptWith(
        bytes.slice(0, SALT_BYTES),
        bytes.slice(SALT_BYTES, SALT_BYTES + IV_BYTES),
        bytes.slice(SALT_BYTES + IV_BYTES),
        password,
        ITERATIONS_LEGACY_V1,
      );
      return validateCookieArray(JSON.parse(plain));
    } catch (error) {
      if (error instanceof UnsupportedBackupFormatError) throw error;
      throw new Error('Decryption failed. Incorrect password or corrupted file.');
    }
  }

  throw new Error('Failed to parse backup file. Ensure it is a valid .4nt backup.');
};

/**
 * Auto-detect whether a backup payload string is encrypted (either a v2 JSON
 * BackupEnvelope or a v1 base64 stream) versus an unencrypted JSON cookie array.
 */
const detectEncryptedBackup = (payload: string): boolean => {
  const trimmed = payload.trim();
  if (trimmed.startsWith('[')) return false;
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as Partial<BackupEnvelope> & { cookies?: unknown };
      if (parsed.format === '4ndr0cookie-backup' || typeof parsed.payload === 'string') {
        return true;
      }
      if (Array.isArray(parsed.cookies)) {
        return false;
      }
    } catch {
      return true;
    }
  }
  return true;
};

/**
 * Unified parse entry point (signature retained from the original module).
 * `isEncrypted` defaults to auto-detection when omitted.
 */
export const parseCookieBackup = async (
  payload: string,
  password?: string,
  isEncrypted?: boolean,
): Promise<{ cookies: SerializedCookie[] }> => {
  const encrypted = isEncrypted ?? detectEncryptedBackup(payload);
  if (encrypted) {
    if (!password) {
      throw new PasswordRequiredError('Password is required for encrypted backups.');
    }
    return { cookies: await decryptBackup(payload, password) };
  }
  try {
    const parsed = JSON.parse(payload);
    const arrayCandidate =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray((parsed as { cookies?: unknown }).cookies)
        ? (parsed as { cookies: unknown }).cookies
        : parsed;
    return { cookies: validateCookieArray(arrayCandidate) };
  } catch {
    throw new Error('Failed to parse backup file. Ensure it is a valid JSON file.');
  }
};

/* ─── Directive Gamma: restoration primitives ─── */

/**
 * Synthesize the `url` property required by `chrome.cookies.set()`:
 * strip leading dots from the domain, then prefix https/http according
 * to the cookie's own `secure` flag, and append the path.
 */
export const synthesizeCookieUrl = (cookie: SerializedCookie): string => {
  const host = cookie.domain.replace(/^\.+/, '');
  const path = cookie.path || '/';
  return `${cookie.secure ? 'https' : 'http'}://${host}${path}`;
};

/**
 * Build SetDetails for one cookie, hardened against data loss:
 *   - host-only cookies never receive a `domain` (keeps host-only semantics)
 *   - session cookies never receive an `expirationDate`
 *   - `sameSite: no_restriction` requires `secure` per Chrome enforcement
 *   - unknown storeId falls back to the default cookie store
 */
export const buildCookieSetDetails = (
  cookie: SerializedCookie,
  availableStoreIds: string[],
): chrome.cookies.SetDetails => {
  const details: chrome.cookies.SetDetails = {
    url: synthesizeCookieUrl(cookie),
    name: cookie.name,
    value: cookie.value,
    path: cookie.path || '/',
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
  };

  if (!cookie.hostOnly && cookie.domain) {
    details.domain = cookie.domain;
  }

  if (cookie.expirationDate && !cookie.session) {
    details.expirationDate = cookie.expirationDate;
  }

  if (
    cookie.sameSite === 'no_restriction' ||
    cookie.sameSite === 'lax' ||
    cookie.sameSite === 'strict' ||
    cookie.sameSite === 'unspecified'
  ) {
    if (cookie.sameSite === 'no_restriction') {
      details.secure = true; // Chrome requirement for SameSite=None
    }
    details.sameSite = cookie.sameSite;
  }

  if (cookie.storeId && availableStoreIds.includes(cookie.storeId)) {
    details.storeId = cookie.storeId;
  } else if (cookie.storeId) {
    console.warn(`Cookie store ID "${cookie.storeId}" not found. Using default store.`);
  }

  return details;
};

export const getAvailableCookieStoreIds = async (): Promise<string[]> => {
  const stores = await chrome.cookies.getAllCookieStores();
  return stores.map((s) => s.id);
};
