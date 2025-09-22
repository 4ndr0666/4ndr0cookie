import React, { useState, useEffect } from 'react';

class PasswordRequiredError extends Error {
  constructor() {
    super('Password required to decrypt backup');
    this.name = 'PasswordRequiredError';
  }
}

const BASE64_BODY = /^[A-Za-z0-9+/]+={0,2}$/;

const normalizeEncryptedPayload = (value: string): string => value.replace(/\s+/g, '');

const isLikelyEncryptedPayload = (value: string): boolean => {
  const sanitized = normalizeEncryptedPayload(value);
  if (sanitized.length <= 44 || sanitized.length % 4 !== 0) {
    return false;
  }
  return BASE64_BODY.test(sanitized);
};

interface BackupStats {
  totalCookies: number;
  timestamp: number;
  encrypted: boolean;
}

type SerializedCookie = chrome.cookies.Cookie;

const CookieBackupManager: React.FC = () => {
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [backupPassword, setBackupPassword] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [showBackupPassword, setShowBackupPassword] = useState(false);
  const [showRestorePassword, setShowRestorePassword] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restorePayload, setRestorePayload] = useState<string | null>(null);
  const [lastBackup, setLastBackup] = useState<BackupStats | null>(null);
  const [restoreProgress, setRestoreProgress] = useState(0);
  const [restoreTotal, setRestoreTotal] = useState(0);
  const [detectedEncrypted, setDetectedEncrypted] = useState<boolean | null>(null);
  const [detectedCookieCount, setDetectedCookieCount] = useState<number | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);

  useEffect(() => {
    loadLastBackupInfo();
  }, []);

  const loadLastBackupInfo = async () => {
    try {
      const result = await chrome.storage.local.get(['lastBackup']);
      if (result.lastBackup) {
        setLastBackup(result.lastBackup);
      }
    } catch (error) {
      console.error('Error loading backup info:', error);
    }
  };

  const saveLastBackupInfo = async (stats: BackupStats) => {
    try {
      await chrome.storage.local.set({ lastBackup: stats });
      setLastBackup(stats);
    } catch (error) {
      console.error('Error saving backup info:', error);
    }
  };

  // Modern Web Crypto API encryption
  const encryptData = async (data: string, password: string): Promise<string> => {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);

    // Generate a random salt
    const salt = crypto.getRandomValues(new Uint8Array(16));

    // Derive key from password
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );

    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Encrypt data
    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      dataBuffer
    );

    // Combine salt, iv, and encrypted data
    const resultBuffer = new Uint8Array(salt.length + iv.length + encryptedBuffer.byteLength);
    resultBuffer.set(salt, 0);
    resultBuffer.set(iv, salt.length);
    resultBuffer.set(new Uint8Array(encryptedBuffer), salt.length + iv.length);

    // Convert to base64
    return btoa(String.fromCharCode.apply(null, Array.from(resultBuffer)));
  };

  const decryptData = async (encryptedData: string, password: string): Promise<string> => {
    try {
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      // Convert from base64
      const sanitizedPayload = normalizeEncryptedPayload(encryptedData);
      if (sanitizedPayload.length <= 44 || sanitizedPayload.length % 4 !== 0) {
        throw new Error('Encrypted backup payload is malformed');
      }

      const binaryString = atob(sanitizedPayload);
      const encryptedBuffer = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        encryptedBuffer[i] = binaryString.charCodeAt(i);
      }

      // Extract salt, iv, and encrypted data
      const salt = encryptedBuffer.slice(0, 16);
      const iv = encryptedBuffer.slice(16, 28);
      const encrypted = encryptedBuffer.slice(28);
      if (encrypted.length <= 16) {
        throw new Error('Encrypted backup payload is too short');
      }
      const ciphertext = encrypted.slice(0, encrypted.length - 16);
      const authTag = encrypted.slice(encrypted.length - 16);

      // Derive key from password
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey']
      );

      const key = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: 100000,
          hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );

      // Decrypt data
      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        (() => {
          const combined = new Uint8Array(ciphertext.length + authTag.length);
          combined.set(ciphertext, 0);
          combined.set(authTag, ciphertext.length);
          return combined;
        })()
      );

      return decoder.decode(decryptedBuffer);
    } catch (error) {
      throw new Error('Decryption failed - incorrect password or corrupted file');
    }
  };

  const parseSerializedCookies = (raw: string): SerializedCookie[] => {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error('Backup file does not contain a cookie list');
    }
    return parsed as SerializedCookie[];
  };

  const backupAllCookies = async () => {
    if (!backupPassword.trim()) {
      alert('Please enter a backup password');
      return;
    }

    setIsBackingUp(true);
    try {
      // Get all cookies from all domains
      const cookies = await chrome.cookies.getAll({});

      if (cookies.length === 0) {
        alert('No cookies found to backup');
        return;
      }

      const cookieData = JSON.stringify(cookies, null, 2);
      const encryptedData = await encryptData(cookieData, backupPassword);

      // Create filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `4ndr0tools-cookies-${timestamp}.4nt`;

      // Download encrypted file
      const blob = new Blob([encryptedData], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();

      URL.revokeObjectURL(url);

      // Save backup stats
      const stats: BackupStats = {
        totalCookies: cookies.length,
        timestamp: Date.now(),
        encrypted: true
      };

      await saveLastBackupInfo(stats);
      setBackupPassword('');

      alert(`Successfully backed up ${cookies.length} cookies!`);

    } catch (error) {
      console.error('Backup error:', error);
      alert('Backup failed: ' + (error as Error).message);
    } finally {
      setIsBackingUp(false);
    }
  };

  const inspectBackupPayload = (payload: string) => {
    const trimmed = payload.trim();
    if (!trimmed) {
      throw new Error('Backup file is empty');
    }

    if (trimmed.startsWith('[')) {
      const cookies = parseSerializedCookies(trimmed);
      return { payload: trimmed, encrypted: false, cookieCount: cookies.length };
    }

    if (isLikelyEncryptedPayload(trimmed)) {
      return {
        payload: normalizeEncryptedPayload(trimmed),
        encrypted: true,
        cookieCount: null
      };
    }

    throw new Error('Unrecognized backup format. Expected JSON or encrypted .4nt payload.');
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setRestoreError(null);
    setRestoreStatus(null);
    setDetectedEncrypted(null);
    setDetectedCookieCount(null);
    setRestorePayload(null);

    const file = event.target.files?.[0];
    if (!file) {
      event.target.value = '';
      return;
    }

    try {
      const fileContent = await file.text();
      const details = inspectBackupPayload(fileContent);

      setRestoreFile(file);
      setRestorePayload(details.payload);
      setDetectedEncrypted(details.encrypted);
      setDetectedCookieCount(details.cookieCount);
    } catch (error) {
      console.error('Failed to read backup file:', error);
      setRestoreFile(null);
      setRestorePayload(null);
      setRestoreError((error as Error).message || 'Unable to read backup file.');
    } finally {
      event.target.value = '';
    }
  };

  const parseCookieBackup = async (
    payload: string,
    password?: string,
    encryptedHint = false
  ): Promise<{ cookies: SerializedCookie[]; encrypted: boolean }> => {
    const trimmedPayload = payload.trim();
    if (!trimmedPayload) {
      throw new Error('Backup file is empty');
    }

    if (!encryptedHint) {
      try {
        const cookies = parseSerializedCookies(trimmedPayload);
        return { cookies, encrypted: false };
      } catch (plainError) {
        if (!isLikelyEncryptedPayload(trimmedPayload)) {
          throw plainError instanceof Error
            ? plainError
            : new Error('Backup file does not contain valid cookie data');
        }
      }
    }

    if (!password || !password.trim()) {
      throw new PasswordRequiredError();
    }

    try {
      const decryptedData = await decryptData(trimmedPayload, password.trim());
      const cookies = parseSerializedCookies(decryptedData);
      return { cookies, encrypted: true };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Unable to restore backup file');
    }
  };

  const buildCookieSetDetails = (
    cookie: SerializedCookie,
    availableStoreIds: Set<string>
  ): chrome.cookies.SetDetails => {
    const protocol = cookie.secure ? 'https:' : 'http:';
    const cookiePath = cookie.path && cookie.path.startsWith('/') ? cookie.path : `/${cookie.path ?? ''}`;
    const normalizedDomain = cookie.domain?.startsWith('.')
      ? cookie.domain.slice(1)
      : cookie.domain;
    const hostname = normalizedDomain || cookie.domain;

    if (!hostname) {
      throw new Error(`Cookie ${cookie.name} is missing a domain`);
    }

    const details: chrome.cookies.SetDetails = {
      url: `${protocol}//${hostname}${cookiePath}`,
      name: cookie.name,
      value: cookie.value,
      path: cookiePath,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly
    };

    if (!cookie.hostOnly && cookie.domain) {
      details.domain = cookie.domain;
    }

    if (cookie.sameSite && cookie.sameSite !== 'unspecified') {
      details.sameSite = cookie.sameSite;
    }

    if (!cookie.session && cookie.expirationDate) {
      details.expirationDate = cookie.expirationDate;
    }

    if (cookie.storeId && availableStoreIds.has(cookie.storeId)) {
      details.storeId = cookie.storeId;
    }

    return details;
  };

  const getAvailableStoreIds = async (): Promise<Set<string>> => {
    return new Promise((resolve, reject) => {
      chrome.cookies.getAllCookieStores((stores) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(new Set(stores.map((store) => store.id)));
        }
      });
    });
  };

  const restoreFromBackup = async () => {
    if (!restoreFile || !restorePayload) {
      alert('Please select a backup file');
      return;
    }

    setIsRestoring(true);
    setRestoreProgress(0);
    setRestoreError(null);
    setRestoreStatus(null);

    try {
      const availableStoreIds = await getAvailableStoreIds().catch((error) => {
        console.warn('restoreFromBackup: failed to load cookie stores', error);
        return new Set<string>();
      });

      const password = restorePassword.trim();
      let cookiesResult: { cookies: SerializedCookie[]; encrypted: boolean } | null = null;

      try {
        cookiesResult = await parseCookieBackup(restorePayload, password, detectedEncrypted ?? false);
      } catch (error) {
        if (error instanceof PasswordRequiredError) {
          setRestoreError('This backup is encrypted. Enter the password and try again.');
          return;
        }
        throw error;
      }

      if (!cookiesResult) {
        throw new Error('Unable to process backup file.');
      }

      const { cookies } = cookiesResult;

      if (!cookies.length) {
        setRestoreError('Backup file does not contain any cookies to restore.');
        return;
      }

      setRestoreTotal(cookies.length);
      let restored = 0;
      let failed = 0;

      const currentTime = Date.now() / 1000;

      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i];

        try {
          if (cookie.expirationDate && currentTime > cookie.expirationDate) {
            continue;
          }

          const cookieToSet = buildCookieSetDetails(cookie, availableStoreIds);

          await new Promise<void>((resolve, reject) => {
            chrome.cookies.set(cookieToSet, (result) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else if (result) {
                restored++;
                resolve();
              } else {
                failed++;
                resolve();
              }
            });
          });
        } catch (error) {
          failed++;
          console.error('Error restoring cookie:', error);
        }

        setRestoreProgress(i + 1);
      }

      setRestorePassword('');
      setRestoreFile(null);
      setRestorePayload(null);
      setDetectedEncrypted(null);
      setDetectedCookieCount(null);

      const summary = `Restore complete!\nRestored: ${restored} cookies\nFailed: ${failed} cookies`;
      setRestoreStatus(summary.replace(/\n/g, ' '));
      alert(summary);

    } catch (error) {
      console.error('Restore error:', error);
      setRestoreError('Restore failed: ' + (error as Error).message);
    } finally {
      setIsRestoring(false);
      setRestoreProgress(0);
      setRestoreTotal(0);
    }
  };

  const requiresRestorePassword = detectedEncrypted === true && !restorePassword.trim();
  const detectedPlaintextCookies = detectedEncrypted === false ? detectedCookieCount : null;

  return (
    <div className="min-h-full bg-gray-900 text-gray-100">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 p-4">
        <h2 className="text-lg font-semibold mb-2" style={{color: '#15FFFF'}}>Cookie Backup & Restore</h2>
        <p className="text-sm text-gray-400">One-click encrypted system-wide backup/restore</p>
      </div>

      <div className="p-4 space-y-6">
        {/* Backup Section */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <h3 className="text-md font-medium text-cyan-400 mb-4">System-wide Backup</h3>

          <div className="space-y-3">
            <div className="relative">
              <input
                type={showBackupPassword ? 'text' : 'password'}
                value={backupPassword}
                onChange={(e) => setBackupPassword(e.target.value)}
                placeholder="Enter backup password"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:border-cyan-400 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowBackupPassword(!showBackupPassword)}
                className="absolute right-3 top-2 text-gray-400 hover:text-cyan-400"
              >
                {showBackupPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>

            <button
              onClick={backupAllCookies}
              disabled={isBackingUp || !backupPassword.trim()}
              className={`w-full py-3 px-4 rounded font-medium transition-colors ${isBackingUp || !backupPassword.trim() ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'hover:opacity-80'}`}
              style={!isBackingUp && backupPassword.trim() ? {backgroundColor: '#15FFFF', color: '#111827'} : {}}
            >
              {isBackingUp ? '🔄 Creating Backup...' : '💾 One-Click Backup'}
            </button>
          </div>

          <p className="text-xs text-gray-500 mt-2">
            Creates an encrypted backup file (.4nt by default) with all cookies from all domains
          </p>
        </div>

        {/* Restore Section */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <h3 className="text-md font-medium text-cyan-400 mb-4">Restore from Backup</h3>

          <div className="space-y-3">
            <input
              type="file"
              accept=".4nt,.json,.txt,.bak"
              onChange={handleFileSelect}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:border-cyan-400 file:mr-4 file:py-1 file:px-2 file:rounded file:border-0 file:bg-cyan-400 file:text-gray-900 file:font-medium hover:file:bg-cyan-300"
            />

            {/* Password input field - always visible */}
            <div className="relative">
              <input
                type={showRestorePassword ? 'text' : 'password'}
                value={restorePassword}
                onChange={(e) => setRestorePassword(e.target.value)}
                placeholder="Enter restore password"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:border-cyan-400 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowRestorePassword(!showRestorePassword)}
                className="absolute right-3 top-2 text-gray-400 hover:text-cyan-400"
              >
                {showRestorePassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>

            {/* Restore button - always visible, but disabled until a backup file is selected */}
            <button
              onClick={restoreFromBackup}
              disabled={
                isRestoring ||
                !restoreFile ||
                requiresRestorePassword
              }
              className={`w-full py-3 px-4 rounded font-medium transition-colors ${
                isRestoring ||
                !restoreFile ||
                requiresRestorePassword
                  ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  : 'bg-green-600 text-white hover:bg-green-500'
              }`}
            >
              {isRestoring ? '🔄 Restoring...' : '📥 One-Click Restore'}
            </button>

          </div>

          {detectedEncrypted !== null && (
            <p className="text-xs text-gray-400">
              {detectedEncrypted
                ? 'Encrypted backup detected. Enter the password before restoring.'
                : `Plaintext backup detected${
                    detectedPlaintextCookies !== null ? ` · ${detectedPlaintextCookies} cookies` : ''
                  }.`}
            </p>
          )}

          {restoreError && (
            <p className="mt-2 text-sm text-red-400">{restoreError}</p>
          )}

          {restoreStatus && !restoreError && (
            <p className="mt-2 text-sm text-cyan-400">{restoreStatus}</p>
          )}

          {isRestoring && restoreTotal > 0 && (
            <div className="mt-4">
              <div className="flex justify-between text-sm text-gray-400 mb-1">
                <span>Restoring cookies...</span>
                <span>{restoreProgress} / {restoreTotal}</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className="bg-cyan-400 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(restoreProgress / restoreTotal) * 100}%` }}
                />
              </div>
            </div>
          )}

          <p className="text-xs text-gray-500 mt-2">
            Restores encrypted or plaintext backup files (.4nt, .json, .txt), prompts for a password when needed, and skips expired cookies automatically.
          </p>
        </div>

        {/* Last Backup Info */}
        {lastBackup && (
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <h3 className="text-md font-medium text-cyan-400 mb-3">Last Backup</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-gray-400">Date:</div>
              <div className="text-cyan-400 font-mono">
                {new Date(lastBackup.timestamp).toLocaleString()}
              </div>
              <div className="text-gray-400">Cookies:</div>
              <div className="text-cyan-400 font-mono">{lastBackup.totalCookies.toLocaleString()}</div>
              <div className="text-gray-400">Encrypted:</div>
              <div className="text-cyan-400">{lastBackup.encrypted ? '✓ Yes' : '✗ No'}</div>
            </div>
          </div>
        )}

        {/* Security Info */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <h3 className="text-md font-medium text-cyan-400 mb-2">Security Features</h3>
          <ul className="text-sm text-gray-400 space-y-1">
            <li>• AES-256-GCM encryption with Web Crypto API</li>
            <li>• PBKDF2 key derivation (100,000 iterations)</li>
            <li>• Random salt and IV for each backup</li>
            <li>• Custom .4nt file format</li>
            <li>• No password storage or transmission</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default CookieBackupManager;


