/**
 * CookieBackupManager.tsx
 *
 * System-wide encrypted cookie backup / restore.
 *
 * Backup : chrome.cookies.getAll → Alpha sanitization matrix →
 *          Beta Web Crypto envelope (PBKDF2 310k / AES-256-GCM) → .4nt file
 * Restore: password prompt → in-memory decrypt → Gamma hardened upsert
 *          (Promise.allSettled, no global removal sweep, expired skipped)
 */

import React, { useState, useEffect } from 'react';

import {
  PasswordRequiredError,
  buildCookieSetDetails,
  decryptBackup,
  encryptBackup,
  getAvailableCookieStoreIds,
  sanitizeCookies,
} from '../modules/cookie-backup';

interface BackupStats {
  totalCookies: number;
  retainedCookies: number;
  droppedCookies: number;
  timestamp: number;
  encrypted: boolean;
}

const RESTORE_CHUNK_SIZE = 20;

const CookieBackupManager: React.FC = () => {
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [backupPassword, setBackupPassword] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [showBackupPassword, setShowBackupPassword] = useState(false);
  const [showRestorePassword, setShowRestorePassword] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [lastBackup, setLastBackup] = useState<BackupStats | null>(null);
  const [restoreProgress, setRestoreProgress] = useState(0);
  const [restoreTotal, setRestoreTotal] = useState(0);
  const [restoreStatus, setRestoreStatus] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);

  useEffect(() => {
    loadLastBackupInfo();
  }, []);

  const loadLastBackupInfo = async () => {
    try {
      const result = await chrome.storage.local.get(['lastBackup']);
      setLastBackup((result.lastBackup as BackupStats) || null);
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

  /* ── Backup: sanitize (Alpha) → encrypt (Beta) → download ── */
  const backupAllCookies = async () => {
    if (!backupPassword.trim()) {
      setBackupError('Enter a backup password first.');
      setBackupStatus(null);
      return;
    }

    setIsBackingUp(true);
    setBackupStatus(null);
    setBackupError(null);

    try {
      const allCookies = await chrome.cookies.getAll({});
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

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `4ndr0tools-cookies-${timestamp}.4nt`;

      const blob = new Blob([encryptedData], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();

      URL.revokeObjectURL(url);

      const stats: BackupStats = {
        totalCookies: allCookies.length,
        retainedCookies: report.retained,
        droppedCookies: report.dropped,
        timestamp: Date.now(),
        encrypted: true,
      };

      await saveLastBackupInfo(stats);
      setBackupPassword('');
      setBackupStatus(
        report.dropped > 0
          ? `Backup created — ${report.retained} cookies retained, ` +
            `${report.dropped} ephemeral dropped (re-issued on demand).`
          : `Backup created — ${report.retained} cookies retained.`,
      );
    } catch (error) {
      console.error('Backup error:', error);
      setBackupError('Backup failed: ' + (error as Error).message);
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so re-selecting the same file re-fires onChange
    event.target.value = '';
    if (file) {
      if (!file.name.endsWith('.4nt')) {
        setRestoreError('Please select a valid .4nt backup file.');
        setRestoreFile(null);
        return;
      }
      setRestoreFile(file);
      setRestoreError(null);
      setRestoreStatus(null);
    }
  };

  /* ── Restore: decrypt → chunked allSettled upsert (Gamma) ── */
  const restoreFromBackup = async () => {
    if (!restoreFile) {
      setRestoreError('Please select a backup file.');
      return;
    }
    if (!restorePassword.trim()) {
      setRestoreError('Please enter the restore password.');
      return;
    }

    setIsRestoring(true);
    setRestoreProgress(0);
    setRestoreStatus(null);
    setRestoreError(null);

    try {
      const fileContent = await restoreFile.text();
      const cookies = await decryptBackup(fileContent, restorePassword);

      const currentTime = Date.now() / 1000;
      const expired = cookies.filter((c) => c.expirationDate && currentTime > c.expirationDate);
      const restorable = cookies.filter((c) => !(c.expirationDate && currentTime > c.expirationDate));

      setRestoreTotal(restorable.length);

      const availableStoreIds = await getAvailableCookieStoreIds();
      let restored = 0;
      let failed = 0;

      for (let i = 0; i < restorable.length; i += RESTORE_CHUNK_SIZE) {
        const chunk = restorable.slice(i, i + RESTORE_CHUNK_SIZE);
        const results = await Promise.allSettled(
          chunk.map((cookie) => chrome.cookies.set(buildCookieSetDetails(cookie, availableStoreIds))),
        );
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value) restored++;
          else failed++;
        }
        setRestoreProgress(Math.min(i + RESTORE_CHUNK_SIZE, restorable.length));
      }

      setRestorePassword('');
      setRestoreFile(null);

      const skippedNote = expired.length > 0 ? `, ${expired.length} expired skipped` : '';
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

  return (
    <div className="hud-card">
      {/* Header */}
      <div className="border-b border-cyan-300/20 px-4 sm:px-6 py-3 sm:py-4">
        <h2 className="hud-title">Cookie Backup &amp; Restore</h2>
        <p className="text-sm text-gray-400">One-click encrypted system-wide backup/restore</p>
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

            <button
              onClick={backupAllCookies}
              disabled={isBackingUp || !backupPassword.trim()}
              className={`hud-btn w-full ${isBackingUp || !backupPassword.trim() ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {isBackingUp ? '🔄 Creating Backup...' : '💾 One-Click Backup'}
            </button>
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
          <h3 className="hud-title mb-4">Restore from Backup</h3>

          <div className="space-y-3">
            <input
              type="file"
              accept=".4nt"
              onChange={handleFileSelect}
              className="hud-input file:hud-btn file:mr-4 file:py-1 file:px-2"
              aria-label="Backup file"
            />

            <div className="relative">
              <input
                type={showRestorePassword ? 'text' : 'password'}
                value={restorePassword}
                onChange={(e) => setRestorePassword(e.target.value)}
                placeholder="Enter restore password"
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
              onClick={restoreFromBackup}
              disabled={isRestoring || !restorePassword.trim() || !restoreFile}
              className={`hud-btn w-full ${isRestoring || !restorePassword.trim() || !restoreFile ? 'opacity-70 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-500'}`}
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
            Restores encrypted .4nt backup files (current and v1.0.x formats).
            Skips expired cookies automatically. Live sessions are never swept —
            restore is a pure upsert.
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
            <li>• No password storage or transmission</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default CookieBackupManager;
