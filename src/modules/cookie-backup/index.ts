/**
 * cookie-backup/index.ts
 *
 * System-wide cookie backup pipeline — sanitization, encryption, multi-format
 * parsing (v2 .4nt, legacy v1 .4nt, SJCL .ckz, raw JSON, Netscape), download
 * orchestration, session-cached upload state, and hardened restoration
 * primitives shared by CookieBackupManager and the background service worker.
 *
 * Work-order directives & reference architecture implemented here:
 *   Alpha — Export sanitization layer (ephemeral token / telemetry purge)
 *   Beta  — Native Web Crypto: PBKDF2 (SHA-256) → AES-256-GCM (.4nt v2 & v1)
 *           + pure Web Crypto RFC 3610 AES-CCM / AES-GCM decryption for SJCL
 *           (.ckz) backups from Cookie Backup and Restore (cndobhdcpmpilkebeebeecgminfhkpcj)
 *   Gamma — Restoration hardening:
 *           - URL synthesis with leading-dot stripping, slash-normalized path,
 *             and HTTPS promotion for `SameSite=None`, `__Secure-*`, and `__Host-*`
 *           - `filterCookieForRestore` implementing the cndobhdcpmpilkebeebeecgminfhkpcj
 *             `filterCookie` normalization (domain leading-dot strip, omitting
 *             `hostOnly`/`session`, dropping `sameSite` when `no_restriction`
 *             or `unspecified` to prevent Chrome SetDetails rejection)
 *           - Multi-stage resilient `restoreSingleCookie` & chunked
 *             `restoreCookiesBatch` via `Promise.allSettled`
 *           - Reliable download delivery via `chrome.downloads.download` +
 *             `chrome.downloads.onChanged` completion reveal with safe
 *             deferred `URL.revokeObjectURL` fallback
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
export type SerializedCookie = chrome.cookies.Cookie & {
  partitionKey?: { topLevelSite?: string };
};

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

/** SJCL JSON envelope produced by Cookie Backup and Restore (.ckz). */
export interface SjclEnvelope {
  v?: number;
  iv: string;
  iter?: number;
  ks?: number;
  ts?: number;
  mode?: 'ccm' | 'gcm' | string;
  adata?: string;
  cipher: 'aes';
  salt: string;
  ct: string;
}

/** Result of the Alpha sanitization matrix. */
export interface SanitizeReport {
  retained: number;
  dropped: number;
  droppedNames: string[]; // deduplicated cookie names, for UI visibility
}

/** Result of a batch cookie restoration run. */
export interface RestoreBatchResult {
  restored: number;
  failed: number;
  skippedExpired: number;
  total: number;
}

/** Pending restore state cached in chrome.storage.session to survive popup focus loss. */
export interface PendingRestoreSession {
  fileName: string;
  payload: string;
  mode: 'file' | 'paste';
  updatedAt: number;
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

/* ─── Directive Beta: native Web Crypto (AES-256-GCM + PBKDF2 + SJCL CCM) ─── */

const ITERATIONS_V2 = 310_000;
const ITERATIONS_LEGACY_V1 = 100_000;
const ITERATIONS_SJCL_DEFAULT = 1_000;
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
  let cleaned = text.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
  while (cleaned.length % 4 !== 0) cleaned += '=';
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const deriveKey = async (
  password: string,
  salt: Uint8Array,
  iterations: number,
  keyLengthBits = 256,
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
    { name: 'AES-GCM', length: keyLengthBits },
    false,
    ['encrypt', 'decrypt'],
  );
};

const deriveRawKeyBytes = async (
  password: string,
  salt: Uint8Array,
  iterations: number,
  keyLengthBits = 256,
): Promise<Uint8Array> => {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    keyLengthBits,
  );
  return new Uint8Array(bits);
};

/**
 * Pure Web Crypto RFC 3610 AES-CCM decryption for SJCL `.ckz` backups
 * created by Cookie Backup and Restore (cndobhdcpmpilkebeebeecgminfhkpcj).
 */
const decryptAesCcmWebCrypto = async (
  rawKey: Uint8Array,
  ivBytes: Uint8Array,
  ctBytes: Uint8Array,
  adataBytes: Uint8Array,
  tagBits = 64,
): Promise<string> => {
  const tagLen = tagBits >>> 3;
  if (ctBytes.length < tagLen) {
    throw new Error('Truncated CCM ciphertext');
  }
  const ol = ctBytes.length - tagLen;
  let L = 2;
  while (L < 4 && ol >>> (8 * L) > 0) L++;
  const nonceLen = 15 - L;
  const nonceSlice = ivBytes.slice(0, nonceLen);

  const ctrKey = await crypto.subtle.importKey(
    'raw',
    rawKey as BufferSource,
    { name: 'AES-CTR' },
    false,
    ['encrypt'],
  );
  const cbcKey = await crypto.subtle.importKey(
    'raw',
    rawKey as BufferSource,
    { name: 'AES-CBC' },
    false,
    ['encrypt'],
  );

  const makeCtrBlock = (counterVal: number): Uint8Array => {
    const blk = new Uint8Array(16);
    blk[0] = L - 1;
    blk.set(nonceSlice, 1);
    let v = counterVal;
    for (let i = 15; i >= 16 - L; i--) {
      blk[i] = v & 0xff;
      v = Math.floor(v / 256);
    }
    return blk;
  };

  // S_0 = AES_ENC(key, A_0)
  const a0 = makeCtrBlock(0);
  const s0Full = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-CBC', iv: new Uint8Array(16) as BufferSource },
      cbcKey,
      a0 as BufferSource,
    ),
  );
  const s0 = s0Full.slice(0, 16);

  // Decrypt payload bytes using AES-CTR starting at counter block A_1
  const a1 = makeCtrBlock(1);
  const plainBuf =
    ol > 0
      ? await crypto.subtle.encrypt(
          { name: 'AES-CTR', counter: a1 as BufferSource, length: L * 8 },
          ctrKey,
          ctBytes.slice(0, ol) as BufferSource,
        )
      : new ArrayBuffer(0);
  const plain = new Uint8Array(plainBuf);

  // Format RFC 3610 CBC-MAC input: B_0 || [adata] || plain
  const hasAdata = adataBytes.length > 0;
  const b0 = makeCtrBlock(ol);
  b0[0] = (L - 1) | (((tagLen - 2) >>> 1) << 3) | (hasAdata ? 0x40 : 0);

  let adataBlock = new Uint8Array(0);
  if (hasAdata) {
    const alen = adataBytes.length;
    const prefix =
      alen < 0xff00
        ? new Uint8Array([(alen >>> 8) & 0xff, alen & 0xff])
        : new Uint8Array([
            0xff,
            0xfe,
            (alen >>> 24) & 0xff,
            (alen >>> 16) & 0xff,
            (alen >>> 8) & 0xff,
            alen & 0xff,
          ]);
    const totalAdata = prefix.length + alen;
    const paddedAdataLen = Math.ceil(totalAdata / 16) * 16;
    adataBlock = new Uint8Array(paddedAdataLen);
    adataBlock.set(prefix, 0);
    adataBlock.set(adataBytes, prefix.length);
  }

  const paddedPlainLen = Math.ceil(ol / 16) * 16;
  const macIn = new Uint8Array(16 + adataBlock.length + paddedPlainLen);
  macIn.set(b0, 0);
  if (adataBlock.length > 0) macIn.set(adataBlock, 16);
  if (ol > 0) macIn.set(plain, 16 + adataBlock.length);

  const cbcOut = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-CBC', iv: new Uint8Array(16) as BufferSource },
      cbcKey,
      macIn as BufferSource,
    ),
  );
  // Web Crypto AES-CBC appends 16-byte PKCS#7 padding block; the final MAC block precedes it
  const macBlockOffset = macIn.length - 16;
  const computedTag = cbcOut.slice(macBlockOffset, macBlockOffset + tagLen);
  const expectedTag = ctBytes.slice(ol);

  let diff = 0;
  for (let i = 0; i < tagLen; i++) {
    diff |= (computedTag[i] ^ s0[i]) ^ expectedTag[i];
  }
  if (diff !== 0) {
    throw new Error('CCM authentication tag mismatch');
  }
  return decoder().decode(plain);
};

const isSjclEnvelope = (raw: unknown): raw is SjclEnvelope => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const candidate = raw as Partial<SjclEnvelope>;
  return (
    candidate.cipher === 'aes' &&
    typeof candidate.iv === 'string' &&
    typeof candidate.ct === 'string' &&
    typeof candidate.salt === 'string'
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
  keyLengthBits = 256,
  tagLengthBits = 128,
  additionalData?: Uint8Array,
): Promise<string> => {
  const key = await deriveKey(password, salt, iterations, keyLengthBits);
  const params: AesGcmParams = {
    name: 'AES-GCM',
    iv: iv as BufferSource,
    tagLength: tagLengthBits,
  };
  if (additionalData && additionalData.length > 0) {
    params.additionalData = additionalData as BufferSource;
  }
  const plain = await crypto.subtle.decrypt(
    params,
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
 *   - v2 JSON envelope (current .4nt export format)
 *   - SJCL .ckz JSON envelope (Cookie Backup and Restore cndobhdcpmpilkebeebeecgminfhkpcj)
 *   - v1.0.x raw base64 (salt | iv | ciphertext, 100k iterations)
 *   - Rejects the interim crypto-js format ("U2FsdGVkX1…") with a clear error.
 */
export const decryptBackup = async (
  raw: string,
  password: string,
): Promise<SerializedCookie[]> => {
  if (!password) throw new PasswordRequiredError('Password is required for encrypted backups.');

  const text = raw.trim();

  // JSON envelopes (v2 4ndr0cookie-backup or SJCL .ckz)
  if (text.startsWith('{')) {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(text);
    } catch {
      throw new Error('Failed to parse backup file. Ensure it is a valid .4nt or .ckz backup.');
    }

    // SJCL .ckz format from Cookie Backup and Restore (cndobhdcpmpilkebeebeecgminfhkpcj)
    if (isSjclEnvelope(parsedJson)) {
      try {
        const salt = fromBase64(parsedJson.salt);
        const iv = fromBase64(parsedJson.iv);
        const ct = fromBase64(parsedJson.ct);
        const iterations = parsedJson.iter || ITERATIONS_SJCL_DEFAULT;
        const ks = parsedJson.ks || 256;
        const ts = parsedJson.ts || 64;
        const mode = (parsedJson.mode || 'ccm').toLowerCase();
        const adata = parsedJson.adata ? encoder().encode(parsedJson.adata) : new Uint8Array(0);

        let plainText: string;
        if (mode === 'gcm') {
          plainText = await decryptWith(salt, iv, ct, password, iterations, ks, ts, adata);
        } else if (mode === 'ccm') {
          const rawKey = await deriveRawKeyBytes(password, salt, iterations, ks);
          plainText = await decryptAesCcmWebCrypto(rawKey, iv, ct, adata, ts);
        } else {
          throw new UnsupportedBackupFormatError(`Unsupported SJCL cipher mode: ${mode}`);
        }
        return validateCookieArray(JSON.parse(plainText));
      } catch (err) {
        if (err instanceof UnsupportedBackupFormatError) throw err;
        throw new Error('Decryption failed. Incorrect password or corrupted file.');
      }
    }

    const envelope = parsedJson as BackupEnvelope;
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
 * Auto-detect whether a backup payload string is encrypted (v2 JSON
 * BackupEnvelope, SJCL .ckz JSON envelope, or v1 base64 stream) versus an
 * unencrypted JSON cookie array or Netscape cookie text.
 */
export const detectEncryptedBackup = (payload: string): boolean => {
  const trimmed = payload.trim();
  if (trimmed.startsWith('[')) return false;
  if (
    trimmed.startsWith('# Netscape') ||
    trimmed.startsWith('#HttpOnly_') ||
    /^[^\t\r\n]+\t(?:TRUE|FALSE)\t/m.test(trimmed)
  ) {
    return false;
  }
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as Partial<BackupEnvelope & SjclEnvelope> & {
        cookies?: unknown;
      };
      if (
        parsed.format === '4ndr0cookie-backup' ||
        typeof parsed.payload === 'string' ||
        isSjclEnvelope(parsed)
      ) {
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

/** Parse Netscape cookie text into SerializedCookie records. */
const parseNetscapeBackup = (text: string): SerializedCookie[] => {
  const cookies: SerializedCookie[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || (line.startsWith('#') && !line.startsWith('#HttpOnly_'))) continue;
    const match =
      /^#HttpOnly_([^\t]+)\t(TRUE|FALSE)\t([^\t]*)\t(TRUE|FALSE)\t(-?\d+)\t([^\t]*)\t(.*)$/.exec(
        line,
      ) ??
      /^([^\t#][^\t]*)\t(TRUE|FALSE)\t([^\t]*)\t(TRUE|FALSE)\t(-?\d+)\t([^\t]*)\t(.*)$/.exec(
        line,
      );
    if (!match) continue;
    const [, rawDomain, subdomainFlag, path, secureFlag, expiration, name, value] = match;
    if (!name) continue;
    let domain = rawDomain;
    let hostOnly = false;
    if (subdomainFlag === 'TRUE') {
      if (!domain.startsWith('.')) domain = '.' + domain;
    } else {
      domain = domain.replace(/^\.+/, '');
      hostOnly = true;
    }
    const expiryNumber = parseInt(expiration, 10);
    const isSession = !Number.isFinite(expiryNumber) || expiryNumber <= 0;
    cookies.push({
      name,
      value,
      domain,
      path: path || '/',
      secure: secureFlag === 'TRUE',
      httpOnly: line.startsWith('#HttpOnly_'),
      hostOnly,
      session: isSession,
      sameSite: 'unspecified',
      storeId: '0',
      ...(isSession ? {} : { expirationDate: expiryNumber }),
    });
  }
  return cookies;
};

/**
 * Unified parse entry point for CookieBackupManager and external callers.
 * `isEncrypted` defaults to auto-detection when omitted.
 */
export const parseCookieBackup = async (
  payload: string,
  password?: string,
  isEncrypted?: boolean,
): Promise<{ cookies: SerializedCookie[] }> => {
  const trimmed = payload.trim();
  if (!trimmed) {
    throw new Error('Backup payload is empty.');
  }

  const encrypted = isEncrypted ?? detectEncryptedBackup(trimmed);
  if (encrypted) {
    if (!password) {
      throw new PasswordRequiredError('Password is required for encrypted backups.');
    }
    return { cookies: await decryptBackup(trimmed, password) };
  }

  if (
    trimmed.startsWith('# Netscape') ||
    trimmed.startsWith('#HttpOnly_') ||
    (!trimmed.startsWith('[') && !trimmed.startsWith('{') && /\t(?:TRUE|FALSE)\t/.test(trimmed))
  ) {
    const netscapeCookies = parseNetscapeBackup(trimmed);
    if (netscapeCookies.length === 0) {
      throw new Error('No valid cookies found in Netscape backup file.');
    }
    return { cookies: netscapeCookies };
  }

  try {
    const parsed = JSON.parse(trimmed);
    const arrayCandidate =
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      Array.isArray((parsed as { cookies?: unknown }).cookies)
        ? (parsed as { cookies: unknown }).cookies
        : parsed;
    return { cookies: validateCookieArray(arrayCandidate) };
  } catch {
    throw new Error('Failed to parse backup file. Ensure it is a valid JSON or .4nt/.ckz file.');
  }
};

/* ─── Directive Gamma: restoration primitives & cndobhdcpmpilkebeebeecgminfhkpcj parity ─── */

const isSingleLabelOrIpHost = (bareHost: string): boolean => {
  if (!bareHost) return true;
  if (bareHost === 'localhost' || !bareHost.includes('.')) return true;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(bareHost)) return true;
  if (bareHost.startsWith('[') || bareHost.includes(':')) return true;
  return false;
};

const normalizeCookiePath = (rawPath?: string): string => {
  if (!rawPath) return '/';
  return rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
};

/**
 * Synthesize the `url` property required by `chrome.cookies.set()`:
 * strip leading dots from the domain, then prefix https/http according
 * to the cookie's own `secure` flag, and append the normalized path.
 */
export const synthesizeCookieUrl = (cookie: Partial<SerializedCookie>): string => {
  const host = (cookie.domain || '').replace(/^\.+/, '');
  const path = normalizeCookiePath(cookie.path);
  return `${cookie.secure ? 'https' : 'http'}://${host}${path}`;
};

/**
 * Build SetDetails for one cookie, hardened against data loss:
 *   - `__Host-` prefix enforces `secure: true`, `path: '/'`, `https://` URL, and omits `domain`
 *   - `__Secure-` prefix enforces `secure: true` and `https://` URL
 *   - host-only cookies (and localhost/IP hosts) never receive a `domain`
 *   - session cookies never receive an `expirationDate`
 *   - `sameSite: no_restriction` requires `secure: true` AND `https://` URL per Chrome enforcement
 *   - unknown storeId falls back to the default cookie store
 */
export const buildCookieSetDetails = (
  cookie: SerializedCookie,
  availableStoreIds: string[],
): chrome.cookies.SetDetails => {
  const isHostPrefix = typeof cookie.name === 'string' && cookie.name.startsWith('__Host-');
  const isSecurePrefix = typeof cookie.name === 'string' && cookie.name.startsWith('__Secure-');
  const bareHost = (cookie.domain || '').replace(/^\.+/, '');
  const effectivePath = isHostPrefix ? '/' : normalizeCookiePath(cookie.path);
  let effectiveSecure = Boolean(cookie.secure) || isHostPrefix || isSecurePrefix;

  const details: chrome.cookies.SetDetails = {
    url: `${effectiveSecure ? 'https' : 'http'}://${bareHost}${effectivePath}`,
    name: cookie.name,
    value: cookie.value ?? '',
    path: effectivePath,
    secure: effectiveSecure,
    httpOnly: Boolean(cookie.httpOnly),
  };

  if (!isHostPrefix && !cookie.hostOnly && cookie.domain && !isSingleLabelOrIpHost(bareHost)) {
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
      effectiveSecure = true;
      details.secure = true;
      details.url = `https://${bareHost}${effectivePath}`;
    }
    details.sameSite = cookie.sameSite;
  }

  if (cookie.storeId && availableStoreIds.includes(cookie.storeId)) {
    details.storeId = cookie.storeId;
  } else if (cookie.storeId) {
    console.warn(`Cookie store ID "${cookie.storeId}" not found. Using default store.`);
  }

  if (
    cookie.partitionKey &&
    typeof cookie.partitionKey === 'object' &&
    typeof cookie.partitionKey.topLevelSite === 'string' &&
    cookie.partitionKey.topLevelSite.length > 0
  ) {
    (details as chrome.cookies.SetDetails & { partitionKey?: { topLevelSite: string } }).partitionKey = {
      topLevelSite: cookie.partitionKey.topLevelSite,
    };
  }

  return details;
};

/**
 * Normalize a cookie into `chrome.cookies.SetDetails` following the proven
 * `filterCookie` algorithm from Cookie Backup and Restore
 * (`cndobhdcpmpilkebeebeecgminfhkpcj` / `candh/cookies-backup-chrome`):
 *   1. Strip `hostOnly` and `session` metadata flags.
 *   2. Strip leading `.` from `cookie.domain`.
 *   3. Synthesize `url = "${protocol}://${domain}${path}"`.
 *   4. Omit `sameSite` when `sameSite === "no_restriction"` or `"unspecified"`
 *      so Chrome does not reject legacy or non-HTTPS cookies during bulk restore.
 *   5. Enforce `__Host-` / `__Secure-` RFC 6265bis invariants and valid `storeId`.
 */
export const filterCookieForRestore = (
  cookie: SerializedCookie,
  availableStoreIds?: string[],
): chrome.cookies.SetDetails => {
  const isHostPrefix = typeof cookie.name === 'string' && cookie.name.startsWith('__Host-');
  const isSecurePrefix = typeof cookie.name === 'string' && cookie.name.startsWith('__Secure-');
  const bareDomain = (cookie.domain || '').replace(/^\.+/, '');
  const path = isHostPrefix ? '/' : normalizeCookiePath(cookie.path);
  const secure = Boolean(cookie.secure) || isHostPrefix || isSecurePrefix;
  const protocol = secure ? 'https' : 'http';
  const cookieUrl = `${protocol}://${bareDomain}${path}`;

  const newCookie: chrome.cookies.SetDetails = {
    url: cookieUrl,
    name: cookie.name,
    value: cookie.value ?? '',
    path,
    secure,
    httpOnly: Boolean(cookie.httpOnly),
  };

  if (!isHostPrefix && !cookie.hostOnly && bareDomain && !isSingleLabelOrIpHost(bareDomain)) {
    newCookie.domain = bareDomain;
  }

  if (cookie.expirationDate && !cookie.session) {
    newCookie.expirationDate = cookie.expirationDate;
  }

  if (
    cookie.sameSite &&
    cookie.sameSite !== 'no_restriction' &&
    cookie.sameSite !== 'unspecified'
  ) {
    newCookie.sameSite = cookie.sameSite;
  }

  if (cookie.storeId) {
    if (!availableStoreIds || availableStoreIds.length === 0 || availableStoreIds.includes(cookie.storeId)) {
      newCookie.storeId = cookie.storeId;
    }
  }

  return newCookie;
};

/**
 * Resilient single-cookie restoration with automatic fallback:
 *   1. Attempts primary `buildCookieSetDetails` write.
 *   2. On rejection or null return, retries with `filterCookieForRestore`
 *      (`cndobhdcpmpilkebeebeecgminfhkpcj` normalization: stripped leading dot,
 *      omitted `no_restriction`/`unspecified` sameSite).
 *   3. On second rejection or null return, retries as a minimal host-only cookie
 *      (without `domain`, `sameSite`, `storeId`, or `partitionKey`).
 */
export const restoreSingleCookie = async (
  cookie: SerializedCookie,
  availableStoreIds: string[],
): Promise<boolean> => {
  if (!cookie || !cookie.name || !cookie.domain) return false;

  const trySet = async (details: chrome.cookies.SetDetails): Promise<boolean> => {
    try {
      const written = await chrome.cookies.set(details);
      return Boolean(written);
    } catch {
      return false;
    }
  };

  // Attempt 1: Full hardened SetDetails
  const primaryDetails = buildCookieSetDetails(cookie, availableStoreIds);
  if (await trySet(primaryDetails)) return true;

  // Attempt 2: cndobhdcpmpilkebeebeecgminfhkpcj filterCookie normalization
  const filteredDetails = filterCookieForRestore(cookie, availableStoreIds);
  if (await trySet(filteredDetails)) return true;

  // Attempt 3: Host-only minimal fallback (omits domain, sameSite, storeId)
  const bareHost = cookie.domain.replace(/^\.+/, '');
  if (!bareHost) return false;
  const isHostPrefix = cookie.name.startsWith('__Host-');
  const isSecure = Boolean(cookie.secure) || isHostPrefix || cookie.name.startsWith('__Secure-');
  const path = isHostPrefix ? '/' : normalizeCookiePath(cookie.path);
  const minimalDetails: chrome.cookies.SetDetails = {
    url: `${isSecure ? 'https' : 'http'}://${bareHost}${path}`,
    name: cookie.name,
    value: cookie.value ?? '',
    path,
    secure: isSecure,
    httpOnly: Boolean(cookie.httpOnly),
    ...(cookie.expirationDate && !cookie.session ? { expirationDate: cookie.expirationDate } : {}),
  };
  return await trySet(minimalDetails);
};

/**
 * Restore an array of cookies in chunks using `Promise.allSettled` and
 * `restoreSingleCookie`. Skips expired persistent cookies and never sweeps
 * existing live sessions (pure idempotent upsert).
 */
export const restoreCookiesBatch = async (
  cookies: SerializedCookie[],
  options?: {
    chunkSize?: number;
    onProgress?: (completed: number, total: number) => void;
  },
): Promise<RestoreBatchResult> => {
  const chunkSize = options?.chunkSize && options.chunkSize > 0 ? options.chunkSize : 20;
  const currentTime = Date.now() / 1000;

  const restorable: SerializedCookie[] = [];
  let skippedExpired = 0;

  for (const cookie of cookies) {
    if (cookie.expirationDate && !cookie.session && currentTime > cookie.expirationDate) {
      skippedExpired++;
    } else {
      restorable.push(cookie);
    }
  }

  const availableStoreIds = await getAvailableCookieStoreIds();
  let restored = 0;
  let failed = 0;

  options?.onProgress?.(0, restorable.length);

  for (let i = 0; i < restorable.length; i += chunkSize) {
    const chunk = restorable.slice(i, i + chunkSize);
    const results = await Promise.allSettled(
      chunk.map((cookie) => restoreSingleCookie(cookie, availableStoreIds)),
    );
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) restored++;
      else failed++;
    }
    options?.onProgress?.(Math.min(i + chunk.length, restorable.length), restorable.length);
  }

  return {
    restored,
    failed,
    skippedExpired,
    total: cookies.length,
  };
};

export const getAvailableCookieStoreIds = async (): Promise<string[]> => {
  try {
    const stores = await chrome.cookies.getAllCookieStores();
    return stores.map((s) => s.id);
  } catch {
    return ['0'];
  }
};

/**
 * Collect all cookies across the default context and all available cookie
 * stores, deduplicating by storeId + domain + path + name.
 */
export const collectAllBrowserCookies = async (): Promise<SerializedCookie[]> => {
  const defaultCookies = await chrome.cookies.getAll({});
  const seen = new Map<string, SerializedCookie>();

  const recordCookie = (c: SerializedCookie) => {
    const partKey = c.partitionKey?.topLevelSite || '';
    const key = `${c.storeId || '0'}|${c.domain}|${c.path}|${c.name}|${partKey}`;
    if (!seen.has(key)) seen.set(key, c);
  };

  for (const c of defaultCookies) recordCookie(c);

  try {
    const stores = await chrome.cookies.getAllCookieStores();
    for (const store of stores) {
      if (!store?.id) continue;
      const storeCookies = await chrome.cookies.getAll({ storeId: store.id });
      for (const c of storeCookies) recordCookie(c);
    }
  } catch {
    // Default store cookies are already captured
  }

  return [...seen.values()];
};

/* ─── Download helper (`chrome.downloads.download` + safe DOM fallback) ─── */

/**
 * Download a backup payload using `chrome.downloads.download` + `onChanged`
 * completion listener (mirroring `candh/cookies-backup-chrome` commit #8)
 * with a safe DOM `<a download>` and deferred `URL.revokeObjectURL` fallback.
 */
export const downloadBackupFile = async (
  data: string | Uint8Array | Blob,
  filename: string,
  mimeType = 'application/octet-stream',
): Promise<number | null> => {
  const blob =
    data instanceof Blob
      ? data
      : new Blob([data as BlobPart], { type: mimeType });

  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    const url = URL.createObjectURL(blob);

    // Primary strategy: chrome.downloads.download (cndobhdcpmpilkebeebeecgminfhkpcj #8)
    if (
      typeof chrome !== 'undefined' &&
      chrome.downloads &&
      typeof chrome.downloads.download === 'function'
    ) {
      try {
        const downloadId = await new Promise<number>((resolve, reject) => {
          let settled = false;
          const finish = (id?: number, err?: Error) => {
            if (settled) return;
            settled = true;
            if (err || typeof id !== 'number') {
              reject(err || new Error('Download did not return an ID'));
            } else {
              resolve(id);
            }
          };

          try {
            const invokeDownload = chrome.downloads.download as (
              options: chrome.downloads.DownloadOptions,
              callback?: (downloadId: number) => void,
            ) => unknown;
            const maybePromise: unknown = invokeDownload(
              { url, filename },
              (id: number) => {
                const lastErr = chrome.runtime?.lastError;
                if (lastErr) {
                  finish(undefined, new Error(lastErr.message));
                } else {
                  finish(id);
                }
              },
            );
            if (
              typeof maybePromise === 'object' &&
              maybePromise !== null &&
              typeof (maybePromise as Promise<number>).then === 'function'
            ) {
              (maybePromise as Promise<number>).then(
                (id) => finish(id),
                (err) => finish(undefined, err instanceof Error ? err : new Error(String(err))),
              );
            }
          } catch (err) {
            finish(undefined, err instanceof Error ? err : new Error(String(err)));
          }
        });

        if (chrome.downloads.onChanged && typeof chrome.downloads.onChanged.addListener === 'function') {
          const onChangedListener = (delta: chrome.downloads.DownloadDelta) => {
            if (delta.id !== downloadId) return;
            const current = delta.state?.current;
            if (current === 'complete' || current === 'interrupted') {
              if (current === 'complete' && typeof chrome.downloads.show === 'function') {
                try {
                  chrome.downloads.show(downloadId);
                } catch {
                  // Ignore show errors
                }
              }
              if (typeof chrome.downloads.onChanged.removeListener === 'function') {
                chrome.downloads.onChanged.removeListener(onChangedListener);
              }
              setTimeout(() => {
                try {
                  URL.revokeObjectURL(url);
                } catch {
                  // Ignore revoke errors
                }
              }, 1000);
            }
          };
          chrome.downloads.onChanged.addListener(onChangedListener);
        } else {
          setTimeout(() => {
            try {
              URL.revokeObjectURL(url);
            } catch {
              // Ignore
            }
          }, 30_000);
        }

        return downloadId;
      } catch {
        // Fall through to anchor download if chrome.downloads failed
      }
    }

    // Fallback strategy: DOM anchor download with deferred revokeObjectURL
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    if (document.body && typeof document.body.appendChild === 'function') {
      document.body.appendChild(link);
    }
    link.click();
    if (typeof link.remove === 'function') {
      link.remove();
    }
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // Ignore
      }
    }, 30_000);
    return null;
  }

  // Environment without URL.createObjectURL (e.g. minimal VM harness): use data URI
  const textContent =
    typeof data === 'string'
      ? data
      : data instanceof Uint8Array
        ? toBase64(data)
        : '';
  const dataUri = `data:${mimeType};charset=utf-8,${encodeURIComponent(textContent)}`;
  const link = document.createElement('a');
  link.href = dataUri;
  link.download = filename;
  link.setAttribute('href', dataUri);
  link.setAttribute('download', filename);
  link.click();
  return null;
};

/* ─── Ephemeral Pending Restore Session Cache (survives popup close) ─── */

const PENDING_RESTORE_KEY = 'pendingCookieRestoreSession';
let memoryPendingRestore: PendingRestoreSession | null = null;

const getSessionArea = (): chrome.storage.StorageArea | null => {
  if (typeof chrome !== 'undefined' && chrome.storage && 'session' in chrome.storage) {
    return (chrome.storage as typeof chrome.storage & { session?: chrome.storage.StorageArea }).session ?? null;
  }
  return null;
};

export const getPendingRestoreSession = async (): Promise<PendingRestoreSession | null> => {
  const area = getSessionArea();
  if (area) {
    try {
      const raw = await area.get([PENDING_RESTORE_KEY]);
      const session = raw[PENDING_RESTORE_KEY] as PendingRestoreSession | undefined;
      if (session && typeof session.payload === 'string') {
        return session;
      }
    } catch {
      return memoryPendingRestore;
    }
  }
  return memoryPendingRestore;
};

export const setPendingRestoreSession = async (
  session: PendingRestoreSession | null,
): Promise<void> => {
  memoryPendingRestore = session;
  const area = getSessionArea();
  if (area) {
    try {
      if (session === null) {
        await area.remove([PENDING_RESTORE_KEY]);
      } else {
        await area.set({ [PENDING_RESTORE_KEY]: session });
      }
    } catch {
      // Fallback remains in memoryPendingRestore
    }
  }
};

export const clearPendingRestoreSession = async (): Promise<void> => {
  await setPendingRestoreSession(null);
};
