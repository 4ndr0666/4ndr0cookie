import React, { useState, useEffect, useRef } from 'react';

console.log('CookieBackupManager component loading...');

interface BackupStats {
  totalCookies: number;
  timestamp: number;
  encrypted: boolean;
}

<<<<<<< HEAD
=======
type SerializedCookie = chrome.cookies.Cookie;

<<<<<<< HEAD
=======
interface ParsedBackupState {
  cookies: SerializedCookie[];
  encrypted: boolean;
  password?: string;
}

>>>>>>> 2d6393e (Enable interactive encrypted cookie restore)
>>>>>>> 14394d4 (Enable interactive encrypted cookie restore)
const CookieBackupManager: React.FC = () => {
  console.log('CookieBackupManager component rendering...');
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [backupPassword, setBackupPassword] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [showBackupPassword, setShowBackupPassword] = useState(false);
  const [showRestorePassword, setShowRestorePassword] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
<<<<<<< HEAD
=======
  const [restorePayload, setRestorePayload] = useState<string | null>(null);
<<<<<<< HEAD
=======
  const [parsedBackup, setParsedBackup] = useState<ParsedBackupState | null>(null);
>>>>>>> 2d6393e (Enable interactive encrypted cookie restore)
>>>>>>> 14394d4 (Enable interactive encrypted cookie restore)
  const [lastBackup, setLastBackup] = useState<BackupStats | null>(null);
  const [restoreProgress, setRestoreProgress] = useState(0);
  const [restoreTotal, setRestoreTotal] = useState(0);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    console.log('CookieBackupManager useEffect running...');
    loadLastBackupInfo();
    
    try {
      console.log('Initializing worker...');
      workerRef.current = new Worker(new URL('../workers/encryption.worker.ts', import.meta.url));
      console.log('Worker initialized successfully.');
    } catch (e) {
      console.error('Error creating worker:', e);
      alert('Failed to load a critical component. Please try reloading the extension.');
    }

    return () => {
      console.log('Terminating worker...');
      workerRef.current?.terminate();
    };
  }, []);

  const loadLastBackupInfo = async () => {
    console.log('Loading last backup info...');
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

  const backupAllCookies = async () => {
    if (!backupPassword.trim()) {
      alert('Please enter a backup password');
      return;
    }

    setIsBackingUp(true);
    
    try {
      const cookies = await chrome.cookies.getAll({});
      if (cookies.length === 0) {
        alert('No cookies found to backup');
        setIsBackingUp(false);
        return;
      }

      const cookieData = JSON.stringify(cookies, null, 2);

      if (workerRef.current) {
        workerRef.current.onmessage = (event) => {
          const { status, result, message } = event.data;
          if (status === 'success') {
            const encryptedData = result;
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
              totalCookies: cookies.length,
              timestamp: Date.now(),
              encrypted: true
            };
            
            saveLastBackupInfo(stats);
            setBackupPassword('');
            alert(`Successfully backed up ${cookies.length} cookies!`);
          } else {
            console.error('Backup error:', message);
            alert('Backup failed: ' + message);
          }
          setIsBackingUp(false);
        };

        workerRef.current.onerror = (error) => {
            console.error('Worker error:', error);
            alert('Backup failed: Worker error');
            setIsBackingUp(false);
        };

        workerRef.current.postMessage({
          type: 'encrypt',
          data: cookieData,
          password: backupPassword
        });
      }
    } catch (error) {
      console.error('Backup error:', error);
      alert('Backup failed: ' + (error as Error).message);
      setIsBackingUp(false);
    }
  };

<<<<<<< HEAD
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log('File selected...');
=======
<<<<<<< HEAD
  const inspectBackupPayload = (payload: string) => {
=======
  type InspectedBackup =
    | { payload: string; encrypted: false; cookies: SerializedCookie[] }
    | { payload: string; encrypted: true; cookies: null };

  const inspectBackupPayload = (payload: string): InspectedBackup => {
>>>>>>> 2d6393e (Enable interactive encrypted cookie restore)
    const trimmed = payload.trim();
    if (!trimmed) {
      throw new Error('Backup file is empty');
    }

    if (trimmed.startsWith('[')) {
      const cookies = parseSerializedCookies(trimmed);
<<<<<<< HEAD
      return { payload: trimmed, encrypted: false, cookieCount: cookies.length };
=======
      return { payload: trimmed, encrypted: false, cookies };
>>>>>>> 2d6393e (Enable interactive encrypted cookie restore)
    }

    if (isLikelyEncryptedPayload(trimmed)) {
      return {
        payload: normalizeEncryptedPayload(trimmed),
        encrypted: true,
<<<<<<< HEAD
        cookieCount: null
=======
        cookies: null
>>>>>>> 2d6393e (Enable interactive encrypted cookie restore)
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
<<<<<<< HEAD
=======
    setParsedBackup(null);
>>>>>>> 2d6393e (Enable interactive encrypted cookie restore)

>>>>>>> 14394d4 (Enable interactive encrypted cookie restore)
    const file = event.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.4nt')) {
        alert('Please select a valid .4nt backup file');
        return;
      }
      console.log('Setting restore file:', file.name);
      setRestoreFile(file);
<<<<<<< HEAD
=======
      setRestorePayload(details.payload);
      setDetectedEncrypted(details.encrypted);
<<<<<<< HEAD
      setDetectedCookieCount(details.cookieCount);
=======

      if (!details.encrypted) {
        setParsedBackup({ cookies: details.cookies, encrypted: false });
        setDetectedCookieCount(details.cookies.length);
      } else {
        setDetectedCookieCount(null);
        let passwordToUse = restorePassword.trim();

        if (!passwordToUse) {
          const prompted = window.prompt('Enter the password for this encrypted backup (.4nt).') ?? '';
          passwordToUse = prompted.trim();
          if (passwordToUse) {
            setRestorePassword(passwordToUse);
          }
        }

        if (!passwordToUse) {
          setRestoreError('Encrypted backup selected. Enter the password to continue.');
          return;
        }

        try {
          const parsed = await parseCookieBackup(details.payload, passwordToUse, true);
          setParsedBackup({ cookies: parsed.cookies, encrypted: true, password: passwordToUse });
          setDetectedCookieCount(parsed.cookies.length);
          setRestoreError(null);
        } catch (error) {
          console.error('Failed to decrypt backup during selection:', error);
          setRestoreError('Unable to decrypt backup with the provided password.');
          setParsedBackup(null);
          setDetectedCookieCount(null);
        }
      }
>>>>>>> 2d6393e (Enable interactive encrypted cookie restore)
    } catch (error) {
      console.error('Failed to read backup file:', error);
      setRestoreFile(null);
      setRestorePayload(null);
      setRestoreError((error as Error).message || 'Unable to read backup file.');
    } finally {
      event.target.value = '';
>>>>>>> 14394d4 (Enable interactive encrypted cookie restore)
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

<<<<<<< HEAD
      if (workerRef.current) {
        workerRef.current.onmessage = async (event) => {
          const { status, result, message } = event.data;
          if (status === 'success') {
            try {
              const decryptedData = result;
              const cookies = JSON.parse(decryptedData);
              
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
                  
                  const cookieToSet: any = { ...cookie };
                  
                  const protocol = cookie.secure ? 'https:' : 'http:';
                  const domain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
                  cookieToSet.url = `${protocol}//${domain}${cookie.path}`;
                  
                  if (cookie.hostOnly) {
                    delete cookieToSet.domain;
                  }
                  if (cookie.session) {
                    delete cookieToSet.expirationDate;
                  }
                  delete cookieToSet.hostOnly;
                  delete cookieToSet.session;
                  
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
=======
<<<<<<< HEAD
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
=======
      let password = restorePassword.trim();
      const needsPassword = (detectedEncrypted ?? parsedBackup?.encrypted ?? false) === true;

      if (needsPassword && !password) {
        const prompted = window.prompt('Enter the password for this encrypted backup (.4nt).') ?? '';
        password = prompted.trim();
        if (!password) {
          setRestoreError('Password required to decrypt encrypted backup.');
          return;
        }
        setRestorePassword(password);
      }

      let cookies: SerializedCookie[] | null = null;

      if (parsedBackup) {
        if (!parsedBackup.encrypted) {
          cookies = parsedBackup.cookies;
        } else if (password && parsedBackup.password === password) {
          cookies = parsedBackup.cookies;
        }
      }

      if (!cookies) {
        try {
          const parsed = await parseCookieBackup(restorePayload, password, detectedEncrypted ?? needsPassword);
          cookies = parsed.cookies;
          setParsedBackup({
            cookies: parsed.cookies,
            encrypted: parsed.encrypted,
            password: parsed.encrypted ? password : undefined
          });
          setDetectedEncrypted(parsed.encrypted);
          setDetectedCookieCount(parsed.cookies.length);
        } catch (error) {
          if (error instanceof PasswordRequiredError) {
            setRestoreError('Password required to decrypt encrypted backup.');
            return;
          }
          if (error instanceof Error) {
            setRestoreError(error.message || 'Unable to restore backup file.');
            return;
          }
          throw error;
        }
      }

      if (!cookies || !cookies.length) {
>>>>>>> 2d6393e (Enable interactive encrypted cookie restore)
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
>>>>>>> 14394d4 (Enable interactive encrypted cookie restore)
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
          } else {
            console.error('Restore error:', message);
            alert('Restore failed: ' + message);
            setIsRestoring(false);
            setRestoreProgress(0);
            setRestoreTotal(0);
          }
        };

        workerRef.current.onerror = (error) => {
            console.error('Worker error:', error);
            alert('Restore failed: Worker error');
            setIsRestoring(false);
            setRestoreProgress(0);
            setRestoreTotal(0);
        };

        workerRef.current.postMessage({
          type: 'decrypt',
          data: fileContent,
          password: restorePassword
        });
      }
<<<<<<< HEAD
=======

      setRestorePassword('');
      setRestoreFile(null);
      setRestorePayload(null);
      setDetectedEncrypted(null);
      setDetectedCookieCount(null);
<<<<<<< HEAD
=======
      setParsedBackup(null);
>>>>>>> 2d6393e (Enable interactive encrypted cookie restore)

      const summary = `Restore complete!\nRestored: ${restored} cookies\nFailed: ${failed} cookies`;
      setRestoreStatus(summary.replace(/\n/g, ' '));
      alert(summary);

>>>>>>> 14394d4 (Enable interactive encrypted cookie restore)
    } catch (error) {
      console.error('Restore error:', error);
      alert('Restore failed: ' + (error as Error).message);
      setIsRestoring(false);
      setRestoreProgress(0);
      setRestoreTotal(0);
    }
  };

<<<<<<< HEAD
=======
<<<<<<< HEAD
  const requiresRestorePassword = detectedEncrypted === true && !restorePassword.trim();
  const detectedPlaintextCookies = detectedEncrypted === false ? detectedCookieCount : null;
=======
  const detectedPlaintextCookies = detectedEncrypted === false ? detectedCookieCount : null;
  const decryptedEncryptedCookies = detectedEncrypted === true ? detectedCookieCount : null;
>>>>>>> 2d6393e (Enable interactive encrypted cookie restore)

>>>>>>> 14394d4 (Enable interactive encrypted cookie restore)
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
            Creates an encrypted .4nt file with all cookies from all domains
          </p>
        </div>

        {/* Restore Section */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <h3 className="text-md font-medium text-cyan-400 mb-4">Restore from Backup</h3>
          
          <div className="space-y-3">
            <input
              type="file"
              accept=".4nt"
              onChange={handleFileSelect}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded focus:outline-none focus:border-cyan-400 file:mr-4 file:py-1 file:px-2 file:rounded file:border-0 file:bg-cyan-400 file:text-gray-900 file:font-medium hover:file:bg-cyan-300"
            />
<<<<<<< HEAD
            
            {restoreFile && (
              <>
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
                
                <button
                  onClick={restoreFromBackup}
                  disabled={isRestoring || !restorePassword.trim()}
                  className={`w-full py-3 px-4 rounded font-medium transition-colors ${isRestoring || !restorePassword.trim() ? 'bg-gray-600 text-gray-400 cursor-not-allowed' : 'bg-green-600 text-white hover:bg-green-500'}`}
                >
                  {isRestoring ? '🔄 Restoring...' : '📥 One-Click Restore'}
                </button>
              </>
            )}
          </div>
          
=======

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
<<<<<<< HEAD
                !restoreFile ||
                requiresRestorePassword
              }
              className={`w-full py-3 px-4 rounded font-medium transition-colors ${
                isRestoring ||
                !restoreFile ||
                requiresRestorePassword
=======
                !restoreFile
              }
              className={`w-full py-3 px-4 rounded font-medium transition-colors ${
                isRestoring ||
                !restoreFile
>>>>>>> 2d6393e (Enable interactive encrypted cookie restore)
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
<<<<<<< HEAD
                ? 'Encrypted backup detected. Enter the password before restoring.'
=======
                ? decryptedEncryptedCookies !== null
                  ? `Encrypted backup decrypted · ${decryptedEncryptedCookies} cookies ready to restore.`
                  : 'Encrypted backup detected. You will be prompted for the password during restore.'
>>>>>>> 2d6393e (Enable interactive encrypted cookie restore)
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

>>>>>>> 14394d4 (Enable interactive encrypted cookie restore)
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
            Restores encrypted .4nt backup files. Skips expired cookies automatically.
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
