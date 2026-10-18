/**
 * CookieBackupManager.tsx
 *
 * System-wide encrypted cookie backup / restore.
 *
 * Backup : collectAllBrowserCookies → Alpha sanitization matrix →
 *          Beta Web Crypto envelope (PBKDF2 310k / AES-256-GCM) →
 *          chrome.downloads.download (.4nt) or one-click clipboard copy
 * Restore: File upload (.4nt, .ckz, .json, .txt) via immediate FileReader OR
 *          inline paste-text fallback ("Unable to upload a backup file?")
 *          modeled on Cookie Backup and Restore (cndobhdcpmpilkebeebeecgminfhkpcj) →
 *          parseCookieBackup (.4nt v2/v1, SJCL .ckz, JSON, Netscape) →
 *          Gamma hardened restoreCookiesBatch (Promise.allSettled + filterCookieForRestore)
 */

import React, { useState, useEffect, useRef } from 'react';

import {
  PasswordRequiredError,
  clearPendingRestoreSession,
  collectAllBrowserCookies,
  detectEncryptedBackup,
  downloadBackupFile,
  encryptBackup,
  getPendingRestoreSession,
  parseCookieBackup,
  restoreCookiesBatch,
  sanitizeCookies,
  setPendingRestoreSession,
} from '../modules/cookie-backup';

interface BackupStats {
  totalCookies: number;
  retainedCookies: number;
  droppedCookies: number;
  timestamp: number;
  encrypted: boolean;
}

const RESTORE_CHUNK_SIZE = 20;

const readUploadedFileAsText = (file: File): Promise<string> => {
  if (typeof file.text === 'function') {
    return file.text();
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(String(e.target?.result ?? ''));
    reader.onerror = () => reject(new Error('Failed to read the selected backup file.'));
    reader.readAsText(file);
  });
};

const CookieBackupManager: React.FC = () => {
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [backupPassword, setBackupPassword] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [showBackupPassword, setShowBackupPassword] = useState(false);
  const [showRestorePassword, setShowRestorePassword] = useState(false);
  const [restoreFileName, setRestoreFileName] = useState<string>('');
  const [restorePayload, setRestorePayload] = useState<string>('');
  const [usePasteFallback, setUsePasteFallback] = useState(false);
  const [lastBackup, setLastBackup] = useState<BackupStats | null>(null);
  const [restoreProgress, setRestoreProgress] = useState(0);
  const [restoreTotal, setRestoreTotal] = useState(0);
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadLastBackupInfo();
    loadPendingSession();
  }, []);

  const loadLastBackupInfo = async () => {
    try {
      const result = await chrome.storage.local.get(['lastBackup']);
      setLastBackup((result.lastBackup as BackupStats) || null);
    } catch (error) {
      console.error('Error loading backup info:', error);
    }
  };

  const loadPendingSession = async () => {
    try {
      const pending = await getPendingRestoreSession();
      if (pending && pending.payload) {
        setRestoreFileName(pending.fileName || '');
        setRestorePayload(pending.payload);
        setUsePasteFallback(pending.mode === 'paste');
      }
    } catch (error) {
      console.error('Error loading pending restore session:', error);
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

  const openBackupInTab = () => {
    try {
      if (typeof chrome !== 'undefined' && chrome.tabs?.create && chrome.runtime?.getURL) {
        chrome.tabs.create({
          url: chrome.runtime.getURL('src/popup/popup.html?tab=backup'),
        });
      }
    } catch (error) {
      console.error('Error opening backup tab:', error);
    }
  };

  /* ── Backup: collect → sanitize (Alpha) → encrypt (Beta) → download / copy ── */
  const executeBackup = async (delivery: 'download' | 'clipboard') => {
    if (!backupPassword.trim()) {
      setBackupError('Enter a backup password first.');
      setBackupStatus(null);
      return;
    }

    setIsBackingUp(true);
    setBackupStatus(null);
    setBackupError(null);

    try {
      const allCookies = await collectAllBrowserCookies();
      if (allCookies.length === 0) {
        setBackupError('No cookies found to backup.');
        return;
      }

      const { cookies, report } = sanitizeCookies(allCookies);
      if (cookies.length === 0) {
        setBackupError('All cookies matched the sanitization matrix — nothing to back up.');
        return;
      }

      const encryptedData = await encryptBackup(cookies, backupPassword);

      if (delivery === 'clipboard') {
        await navigator.clipboard.writeText(encryptedData);
      } else {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `4ndr0tools-cookies-${timestamp}.4nt`;
        await downloadBackupFile(encryptedData, filename, 'application/octet-stream');
      }

      const stats: BackupStats = {
        totalCookies: allCookies.length,
        retainedCookies: report.retained,
        droppedCookies: report.dropped,
        timestamp: Date.now(),
        encrypted: true,
      };

      await saveLastBackupInfo(stats);
      setBackupPassword('');
      const actionLabel = delivery === 'clipboard' ? 'Backup copied to clipboard' : 'Backup created';
      setBackupStatus(
        report.dropped > 0
          ? `${actionLabel} — ${report.retained} cookies retained, ` +
            `${report.dropped} ephemeral dropped (re-issued on demand).`
          : `${actionLabel} — ${report.retained} cookies retained.`,
      );
    } catch (error) {
      console.error('Backup error:', error);
      setBackupError('Backup failed: ' + (error as Error).message);
    } finally {
      setIsBackingUp(false);
    }
  };

  const backupAllCookies = async () => {
    await executeBackup('download');
  };

  const copyBackupToClipboard = async () => {
    await executeBackup('clipboard');
  };

  /* ── File selection: read immediately via FileReader & persist to session ── */
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validExt = /\.(4nt|ckz|json|txt)$/i.test(file.name);
    if (!validExt) {
      setRestoreError('Please select a valid .4nt, .ckz, .json, or .txt backup file.');
      setRestoreFileName('');
      setRestorePayload('');
      await clearPendingRestoreSession();
      return;
    }

    try {
      const content = await readUploadedFileAsText(file);
      if (!content.trim()) {
        setRestoreError('Selected backup file is empty.');
        return;
      }
      setRestoreFileName(file.name);
      setRestorePayload(content);
      setRestoreError(null);
      setRestoreStatus(null);
      await setPendingRestoreSession({
        fileName: file.name,
        payload: content,
        mode: 'file',
        updatedAt: Date.now(),
      });
    } catch (error) {
      console.error('File read error:', error);
      setRestoreError('Failed to read the backup file.');
    }
  };

  const handlePasteChange = async (value: string) => {
    setRestorePayload(value);
    setRestoreError(null);
    setRestoreStatus(null);
    await setPendingRestoreSession(
      value.trim()
        ? {
            fileName: 'pasted-backup',
            payload: value,
            mode: 'paste',
            updatedAt: Date.now(),
          }
        : null,
    );
  };

  const togglePasteMode = () => {
    const next = !usePasteFallback;
    setUsePasteFallback(next);
    setRestoreError(null);
    setRestoreStatus(null);
  };

  const clearSelectedBackup = async () => {
    setRestoreFileName('');
    setRestorePayload('');
    setRestoreError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    await clearPendingRestoreSession();
  };

  /* ── Restore: parseCookieBackup → chunked allSettled upsert (Gamma) ── */
  const restoreFromBackup = async () => {
    const trimmedPayload = restorePayload.trim();
    if (!trimmedPayload) {
      setRestoreError(
        usePasteFallback
          ? 'Please paste your backup contents first.'
          : 'Please select a backup file or use the paste fallback.',
      );
      return;
    }

    const isEncrypted = detectEncryptedBackup(trimmedPayload);
    if (isEncrypted && !restorePassword.trim()) {
      setRestoreError('Please enter the decryption password for this backup.');
      return;
    }

    setIsRestoring(true);
    setRestoreProgress(0);
    setRestoreStatus(null);
    setRestoreError(null);

    try {
      const { cookies } = await parseCookieBackup(
        trimmedPayload,
        restorePassword.trim() || undefined,
        isEncrypted,
      );

      const { restored, failed, skippedExpired } = await restoreCookiesBatch(cookies, {
        chunkSize: RESTORE_CHUNK_SIZE,
        onProgress: (done, total) => {
          setRestoreTotal(total);
          setRestoreProgress(done);
        },
      });

      setRestorePassword('');
      setRestoreFileName('');
      setRestorePayload('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await clearPendingRestoreSession();

      const skippedNote = skippedExpired > 0 ? `, ${skippedExpired} expired skipped` : '';
      setRestoreStatus(
        `Restore complete — ${restored} restored, ${failed} failed${skippedNote}.`,
      );
    } catch (error) {
      console.error('Restore error:', error);
      setRestoreError(
        error instanceof PasswordRequiredError
          ? 'Password is required for encrypted backups.'
          : 'Restore failed: ' + (error as Error).message,
      );
    } finally {
      setIsRestoring(false);
      setRestoreProgress(0);
      setRestoreTotal(0);
    }
  };

  const payloadRequiresPassword = restorePayload.trim()
    ? detectEncryptedBackup(restorePayload)
    : true;
  const canRestore =
    !isRestoring &&
    Boolean(restorePayload.trim()) &&
    (!payloadRequiresPassword || Boolean(restorePassword.trim()));

  return (
    <div className="hud-card">
      {/* Header */}
      <div className="border-b border-cyan-300/20 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
        <div>
          <h2 className="hud-title" style={{ marginBottom: 0 }}>
            Cookie Backup &amp; Restore
          </h2>
          <p className="text-sm text-gray-400">
            One-click encrypted system-wide backup/restore
          </p>
        </div>
        <button
          type="button"
          onClick={openBackupInTab}
          className="hud-btn"
          style={{ fontSize: '0.65rem', padding: '0.25rem 0.5rem' }}
          title="Open Backup & Restore in a persistent browser tab (prevents OS file dialogs from closing the popup)"
          aria-label="Open Backup and Restore in full tab"
        >
          ↗ Full Tab
        </button>
      </div>

      <div className="p-4 space-y-6">
        {/* Backup Section */}
        <div className="hud-section">
          <h3 className="hud-title mb-4">System-wide Backup</h3>

          <div className="space-y-3">
            <div className="relative">
              <input
                type={showBackupPassword ? 'text' : 'password'}
                value={backupPassword}
                onChange={(e) => setBackupPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && backupPassword.trim() && !isBackingUp) {
                    backupAllCookies();
                  }
                }}
                placeholder="Enter backup password"
                className="hud-input pr-10"
                aria-label="Backup password"
              />
              <button
                type="button"
                onClick={() => setShowBackupPassword(!showBackupPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-cyan-400"
                aria-label={showBackupPassword ? 'Hide password' : 'Show password'}
              >
                <span className="hud-icon">{showBackupPassword ? '👁️' : '👁️‍🗨️'}</span>
              </button>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={backupAllCookies}
                disabled={isBackingUp || !backupPassword.trim()}
                className={`hud-btn flex-1 ${isBackingUp || !backupPassword.trim() ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                {isBackingUp ? '🔄 Creating Backup...' : '💾 One-Click Backup'}
              </button>
              <button
                type="button"
                onClick={copyBackupToClipboard}
                disabled={isBackingUp || !backupPassword.trim()}
                className={`hud-btn ${isBackingUp || !backupPassword.trim() ? 'opacity-70 cursor-not-allowed' : ''}`}
                title="Encrypt all cookies and copy the .4nt backup directly to your clipboard"
                aria-label="Copy encrypted backup to clipboard"
              >
                📋 Copy
              </button>
            </div>
          </div>

          <p className="text-xs text-gray-500 mt-2">
            Creates an encrypted .4nt file with all cookies from all domains.
            Ephemeral tokens (Cloudflare, analytics, sliding-window tickets) are
            sanitized out for a clean recovery baseline.
          </p>

          {backupStatus && (
            <p className="text-sm text-cyan-400 mt-2">{backupStatus}</p>
          )}
          {backupError && (
            <p className="text-sm text-red-500 mt-2">{backupError}</p>
          )}
        </div>

        {/* Restore Section */}
        <div className="hud-section">
          <div className="flex items-center justify-between mb-3">
            <h3 className="hud-title" style={{ marginBottom: 0 }}>
              Restore from Backup
            </h3>
            <button
              type="button"
              onClick={togglePasteMode}
              className="text-xs text-cyan-400 hover:underline cursor-pointer"
              aria-label="Toggle paste backup contents fallback"
            >
              {usePasteFallback
                ? '← Upload a backup file instead'
                : 'Unable to upload a file? Paste backup'}
            </button>
          </div>

          <div className="space-y-3">
            {!usePasteFallback ? (
              <div className="space-y-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".4nt,.ckz,.json,.txt"
                  onChange={handleFileSelect}
                  className="hud-input file:hud-btn file:mr-4 file:py-1 file:px-2"
                  aria-label="Backup file"
                />
                {restoreFileName && (
                  <div className="flex items-center justify-between text-xs text-cyan-400 px-1">
                    <span className="truncate">✓ Loaded: {restoreFileName}</span>
                    <button
                      type="button"
                      onClick={clearSelectedBackup}
                      className="text-gray-400 hover:text-red-400 ml-2"
                      aria-label="Clear selected backup file"
                    >
                      ✕ Clear
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                <textarea
                  rows={4}
                  value={restorePayload}
                  onChange={(e) => handlePasteChange(e.target.value)}
                  placeholder='Paste the contents of your .4nt, .ckz, or .json backup file here…'
                  className="hud-input font-mono text-xs"
                  aria-label="Paste backup contents"
                />
              </div>
            )}

            <div className="relative">
              <input
                type={showRestorePassword ? 'text' : 'password'}
                value={restorePassword}
                onChange={(e) => setRestorePassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canRestore) {
                    restoreFromBackup();
                  }
                }}
                placeholder={
                  payloadRequiresPassword
                    ? 'Enter restore password'
                    : 'Password optional (unencrypted backup detected)'
                }
                className="hud-input pr-10"
                aria-label="Restore password"
              />
              <button
                type="button"
                onClick={() => setShowRestorePassword(!showRestorePassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-cyan-400"
                aria-label={showRestorePassword ? 'Hide password' : 'Show password'}
              >
                <span className="hud-icon">{showRestorePassword ? '👁️' : '👁️‍🗨️'}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={restoreFromBackup}
              disabled={!canRestore}
              className={`hud-btn w-full ${!canRestore ? 'opacity-70 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-500'}`}
            >
              {isRestoring ? '🔄 Restoring...' : '📥 One-Click Restore'}
            </button>
          </div>

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
            Restores encrypted .4nt (v2 &amp; v1.0.x), .ckz (SJCL), and JSON/Netscape
            backups. Skips expired cookies automatically. Live sessions are never
            swept — restore is a pure upsert.
          </p>

          {restoreStatus && (
            <p className="text-sm text-cyan-400 mt-2">{restoreStatus}</p>
          )}

          {restoreError && (
            <p className="text-sm text-red-500 mt-2">{restoreError}</p>
          )}
        </div>

        {/* Last Backup Info */}
        {lastBackup && (
          <div className="hud-section">
            <h3 className="hud-title mb-3">Last Backup</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-gray-400">Date:</div>
              <div className="text-cyan-400 font-mono">
                {new Date(lastBackup.timestamp).toLocaleString()}
              </div>
              <div className="text-gray-400">Cookies:</div>
              <div className="text-cyan-400 font-mono">
                {typeof lastBackup.retainedCookies === 'number'
                  ? `${lastBackup.retainedCookies.toLocaleString()} / ${lastBackup.totalCookies.toLocaleString()}`
                  : lastBackup.totalCookies.toLocaleString()}
              </div>
              <div className="text-gray-400">Encrypted:</div>
              <div className="text-cyan-400">{lastBackup.encrypted ? '✓ Yes' : '✗ No'}</div>
            </div>
          </div>
        )}

        {/* Security Info */}
        <div className="hud-section">
          <h3 className="hud-title mb-2">Security Features</h3>
          <ul className="text-sm text-gray-400 space-y-1">
            <li>• AES-256-GCM via native Web Crypto API</li>
            <li>• PBKDF2 key derivation (SHA-256, 310,000 iterations)</li>
            <li>• Compatible with .4nt, SJCL .ckz, JSON, and Netscape formats</li>
            <li>• No password storage or transmission</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default CookieBackupManager;
