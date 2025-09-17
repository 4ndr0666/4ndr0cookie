import React, { useState, useEffect } from 'react';

interface BackupStats {
  totalCookies: number;
  timestamp: number;
  encrypted: boolean;
}

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
      const binaryString = atob(encryptedData);
      const encryptedBuffer = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        encryptedBuffer[i] = binaryString.charCodeAt(i);
      }

      // Extract salt, iv, and encrypted data
      const salt = encryptedBuffer.slice(0, 16);
      const iv = encryptedBuffer.slice(16, 28);
      const encrypted = encryptedBuffer.slice(28);

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
        encrypted
      );

      return decoder.decode(decryptedBuffer);
    } catch (error) {
      throw new Error('Decryption failed - incorrect password or corrupted file');
    }
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

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.4nt')) {
        alert('Please select a valid .4nt backup file');
        return;
      }
      setRestoreFile(file);
    }
  };

  const restoreFromBackup = async () => {
    if (!restoreFile) {
      alert('Please select a backup file');
      return;
    }

    if (!restorePassword.trim()) {
      alert('Please enter the restore password');
      return;
    }

    setIsRestoring(true);
    setRestoreProgress(0);

    try {
      const fileContent = await restoreFile.text();
      const decryptedData = await decryptData(fileContent, restorePassword);
      const cookies = JSON.parse(decryptedData);

      setRestoreTotal(cookies.length);
      let restored = 0;
      let failed = 0;

      const currentTime = Date.now() / 1000;

      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i];

        try {
          // Skip expired cookies
          if (cookie.expirationDate && currentTime > cookie.expirationDate) {
            continue;
          }

          // Prepare cookie for restoration
          const cookieToSet = { ...cookie };

          // Build URL
          const protocol = cookie.secure ? 'https:' : 'http:';
          const domain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
          cookieToSet.url = `${protocol}//${domain}${cookie.path}`;

          // Remove properties that chrome.cookies.set doesn't accept
          delete cookieToSet.hostOnly;
          delete cookieToSet.session;

          if (cookieToSet.hostOnly === true) {
            delete cookieToSet.domain;
          }

          if (cookieToSet.session === true) {
            delete cookieToSet.expirationDate;
          }

          // Set the cookie
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

      alert(`Restore complete!\nRestored: ${restored} cookies\nFailed: ${failed} cookies`);

    } catch (error) {
      console.error('Restore error:', error);
      alert('Restore failed: ' + (error as Error).message);
    } finally {
      setIsRestoring(false);
      setRestoreProgress(0);
      setRestoreTotal(0);
    }
  };

  return (
    <div className="hud-scroll space-y-4">
      <section className="hud-section">
        <div className="hud-section-header">
          <div>
            <h2 className="hud-section-title">Cookie backup &amp; restore</h2>
            <p className="hud-section-subtitle">One-click encrypted system-wide backup/restore</p>
          </div>
          <span className="hud-chip">
            <span className="hud-chip__dot" />
            AES-256 GCM
          </span>
        </div>
      </section>

      <section className="hud-section">
        <h3 className="hud-section-title">System-wide backup</h3>
        <p className="hud-subtext">Creates an encrypted .4nt file with all cookies from all domains.</p>

        <div className="hud-field-vertical">
          <span className="hud-label">Backup password</span>
          <div className="hud-input-stack">
            <div className="hud-input-wrapper">
              <input
                type={showBackupPassword ? 'text' : 'password'}
                value={backupPassword}
                onChange={(e) => setBackupPassword(e.target.value)}
                placeholder="Enter backup password"
                className="hud-input"
              />
              <button
                type="button"
                onClick={() => setShowBackupPassword(!showBackupPassword)}
                className="hud-input-toggle"
                aria-label={showBackupPassword ? 'Hide password' : 'Show password'}
              >
                {showBackupPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
            <div className="hud-toolbar hud-action-tray">
              <button
                type="button"
                onClick={backupAllCookies}
                disabled={isBackingUp || !backupPassword.trim()}
                className="hud-btn"
                data-variant="accent"
                data-size="sm"
                data-block="true"
              >
                {isBackingUp ? '🔄 Creating backup…' : '💾 One-click backup'}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="hud-section">
        <h3 className="hud-section-title">Restore from backup</h3>
        <p className="hud-subtext">Restores encrypted .4nt backup files and skips expired cookies automatically.</p>

        <div className="hud-field-vertical">
          <span className="hud-label">Encrypted backup file</span>
          <input
            type="file"
            accept=".4nt"
            onChange={handleFileSelect}
            className="hud-file-input"
          />

          {restoreFile && (
            <div className="hud-field-vertical">
              <span className="hud-label">Restore password</span>
              <div className="hud-input-wrapper">
                <input
                  type={showRestorePassword ? 'text' : 'password'}
                  value={restorePassword}
                  onChange={(e) => setRestorePassword(e.target.value)}
                  placeholder="Enter restore password"
                  className="hud-input"
                />
                <button
                  type="button"
                  onClick={() => setShowRestorePassword(!showRestorePassword)}
                  className="hud-input-toggle"
                  aria-label={showRestorePassword ? 'Hide password' : 'Show password'}
                >
                  {showRestorePassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>

              <div className="hud-toolbar hud-action-tray">
                <button
                  type="button"
                  onClick={restoreFromBackup}
                  disabled={isRestoring || !restorePassword.trim()}
                  className="hud-btn"
                  data-variant="success"
                  data-size="sm"
                  data-block="true"
                >
                  {isRestoring ? '🔄 Restoring…' : '📥 One-click restore'}
                </button>
              </div>

              <button
                type="button"
                onClick={restoreFromBackup}
                disabled={isRestoring || !restorePassword.trim()}
                className="hud-btn"
                data-variant="success"
                data-size="sm"
                data-block="true"
              >
                {isRestoring ? '🔄 Restoring…' : '📥 One-click restore'}
              </button>
            </div>
          )}
        </div>

        {isRestoring && restoreTotal > 0 && (
          <div className="hud-progress">
            <div className="hud-progress__header">
              <span>Restoring cookies…</span>
              <span>{restoreProgress} / {restoreTotal}</span>
            </div>
            <div className="hud-progress__track">
              <div
                className="hud-progress__bar"
                style={{ width: `${(restoreProgress / restoreTotal) * 100}%` }}
              />
            </div>
          </div>
        )}
      </section>

      {lastBackup && (
        <section className="hud-section">
          <h3 className="hud-section-title">Last backup</h3>
          <div className="hud-stat-grid">
            <span className="hud-subtext">Date</span>
            <span className="hud-subtext hud-subtext--mono">{new Date(lastBackup.timestamp).toLocaleString()}</span>
            <span className="hud-subtext">Cookies</span>
            <span className="hud-subtext hud-subtext--mono">{lastBackup.totalCookies.toLocaleString()}</span>
            <span className="hud-subtext">Encrypted</span>
            <span className="hud-subtext">{lastBackup.encrypted ? '✓ Yes' : '✗ No'}</span>
          </div>
        </section>
      )}

      <section className="hud-section hud-section--inline">
        <h3 className="hud-section-title">Security features</h3>
        <ul className="hud-list">
          <li>AES-256-GCM encryption with Web Crypto API</li>
          <li>PBKDF2 key derivation (100,000 iterations)</li>
          <li>Random salt and IV per backup</li>
          <li>Custom .4nt file format</li>
          <li>No password storage or transmission</li>
        </ul>
      </section>
    </div>
  );
};

export default CookieBackupManager;
