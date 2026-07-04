import React, { useState, useEffect, useCallback } from 'react';
import { scorchClientStorage, refreshClientStorage } from '../lib/clearancePayload';

interface OperationSummary {
  operation: 'refresh' | 'clear';
  cookiesWiped: number;
  vectorsSwept: string[];
  timestamp: number;
}

type ConfirmState = 'idle' | 'confirm-refresh' | 'confirm-clear';

const SiteClearanceManager: React.FC = () => {
  const [currentSite, setCurrentSite] = useState<string>('');
  const [isRunning, setIsRunning] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState>('idle');
  const [lastOp, setLastOp] = useState<OperationSummary | null>(null);
  const [autoReload, setAutoReload] = useState(true);

  useEffect(() => {
    getCurrentSite();
    loadSettings();
  }, []);

  const getCurrentSite = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab.url) setCurrentSite(new URL(tab.url).hostname);
    } catch (e) {
      console.error('[SCM] getCurrentSite failed', e);
    }
  };

  const loadSettings = async () => {
    try {
      const r = await chrome.storage.local.get(['autoReload']);
      if (typeof r.autoReload === 'boolean') setAutoReload(r.autoReload);
    } catch (e) {
      console.error('[SCM] loadSettings failed', e);
    }
  };

  const saveAutoReload = async (val: boolean) => {
    setAutoReload(val);
    await chrome.storage.local.set({ autoReload: val }).catch(console.error);
  };

  /* ── REFRESH: client-side only, HttpOnly preserved ── */
  const executeRefresh = useCallback(async () => {
    if (!currentSite || isRunning) return;
    setConfirmState('idle');
    setIsRunning(true);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id || !tab.url) return;

      // Count readable cookies before wipe for summary
      const allCookies = await chrome.cookies.getAll({ domain: currentSite });
      const readableCount = allCookies.filter((c) => !c.httpOnly).length;

      // Inject refresh payload — client-side only, no browsingData call
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: refreshClientStorage,
      });

      setLastOp({
        operation: 'refresh',
        cookiesWiped: readableCount,
        vectorsSwept: ['readable cookies', 'localStorage', 'sessionStorage', 'window.name', 'IndexedDB', 'Cache Storage', 'Service Workers'],
        timestamp: Date.now(),
      });

      chrome.action.setBadgeText({ text: '✓', tabId: tab.id });
      chrome.action.setBadgeBackgroundColor({ color: '#00E5FF', tabId: tab.id });
      setTimeout(() => chrome.action.setBadgeText({ text: '', tabId: tab.id! }), 2000);

      if (autoReload) setTimeout(() => chrome.tabs.reload(tab.id!), 400);
    } catch (e) {
      console.error('[SCM] Refresh failed', e);
      setBadgeError();
    } finally {
      setIsRunning(false);
    }
  }, [currentSite, isRunning, autoReload]);

  /* ── CLEAR: browsingData + client sweep, everything gone ── */
  const executeClear = useCallback(async () => {
    if (!currentSite || isRunning) return;
    setConfirmState('idle');
    setIsRunning(true);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.id || !tab.url) return;

      const allCookies = await chrome.cookies.getAll({ domain: currentSite });
      const totalCount = allCookies.length;

      // Wipe both http:// and https:// origins (hostname-scoped per R4-B)
      const origins = [
        `https://${currentSite}`,
        `http://${currentSite}`,
      ] as [string, ...string[]];

      await chrome.browsingData.remove(
        { origins },
        {
          appcache: true,
          cache: true,
          cookies: true,
          fileSystems: true,
          indexedDB: true,
          localStorage: true,
          serviceWorkers: true,
          webSQL: true,
        },
      );

      // Client-side sweep layer
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scorchClientStorage,
      });

      setLastOp({
        operation: 'clear',
        cookiesWiped: totalCount,
        vectorsSwept: ['all cookies (incl. HttpOnly)', 'localStorage', 'sessionStorage', 'window.name', 'IndexedDB', 'Cache Storage', 'Service Workers', 'HTTP cache', 'AppCache', 'FileSystems'],
        timestamp: Date.now(),
      });

      chrome.action.setBadgeText({ text: '✓', tabId: tab.id });
      chrome.action.setBadgeBackgroundColor({ color: '#00E5FF', tabId: tab.id });
      setTimeout(() => chrome.action.setBadgeText({ text: '', tabId: tab.id! }), 2000);

      if (autoReload) setTimeout(() => chrome.tabs.reload(tab.id!), 400);
    } catch (e) {
      console.error('[SCM] Clear failed', e);
      setBadgeError();
    } finally {
      setIsRunning(false);
    }
  }, [currentSite, isRunning, autoReload]);

  const setBadgeError = () => {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (!tab?.id) return;
      chrome.action.setBadgeText({ text: '✗', tabId: tab.id });
      chrome.action.setBadgeBackgroundColor({ color: '#FF4444', tabId: tab.id });
      setTimeout(() => chrome.action.setBadgeText({ text: '', tabId: tab.id! }), 2000);
    });
  };

  const handleRefreshClick = () => {
    if (confirmState === 'confirm-refresh') { executeRefresh(); return; }
    setConfirmState('confirm-refresh');
  };

  const handleClearClick = () => {
    if (confirmState === 'confirm-clear') { executeClear(); return; }
    setConfirmState('confirm-clear');
  };

  const cancelConfirm = () => setConfirmState('idle');

  return (
    <div className="hud-card">
      {/* Header */}
      <div className="border-b border-cyan-300/20 px-4 py-3">
        <h2 className="hud-title">Site Clearance Manager</h2>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Shortcut configurable in <em>chrome://extensions/shortcuts</em>
        </p>
      </div>

      <div className="px-4 py-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
        <span className="hud-title" style={{ fontSize: '0.7rem' }}>ACTIVE TARGET —</span>{' '}
        <span className="font-mono" style={{ color: 'var(--accent-cyan)' }}>
          {currentSite || 'unknown'}
        </span>
      </div>

      <div className="p-4 space-y-4">

        {/* Quick Action Buttons */}
        <div className="hud-section">
          <h3 className="hud-title" style={{ fontSize: '0.7rem' }}>QUICK ACTIONS</h3>

          {/* Idle state — two half-width buttons */}
          {confirmState === 'idle' && (
            <div className="flex gap-2">
              <button
                onClick={handleRefreshClick}
                disabled={isRunning || !currentSite}
                aria-label="Refresh site — clears telemetry, stays logged in"
                className="hud-btn flex-1"
                style={{ fontSize: '0.75rem' }}
              >
                {isRunning ? '⟳ Running…' : '🔄 Refresh Site'}
              </button>
              <button
                onClick={handleClearClick}
                disabled={isRunning || !currentSite}
                aria-label="Clear site — scorched earth, logs you out"
                className="hud-btn hud-btn-danger flex-1"
                style={{ fontSize: '0.75rem' }}
              >
                🗑️ Clear Site
              </button>
            </div>
          )}

          {/* Confirm Refresh */}
          {confirmState === 'confirm-refresh' && (
            <div
              className="flex items-center gap-2 p-2 rounded"
              style={{
                background: 'rgba(0,229,255,0.05)',
                border: '1px solid var(--accent-cyan-border-hover)',
              }}
            >
              <span className="text-xs flex-1" style={{ color: 'var(--text-cyan-active)' }}>
                ⚠ Refresh <strong>{currentSite}</strong>? (stays logged in)
              </span>
              <button
                onClick={executeRefresh}
                className="hud-btn hud-btn-confirm"
                style={{ fontSize: '0.7rem', padding: '0.25rem 0.6rem' }}
                aria-label="Confirm refresh"
              >
                Yes
              </button>
              <button
                onClick={cancelConfirm}
                className="hud-btn"
                style={{ fontSize: '0.7rem', padding: '0.25rem 0.6rem' }}
                aria-label="Cancel"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Confirm Clear */}
          {confirmState === 'confirm-clear' && (
            <div
              className="flex items-center gap-2 p-2 rounded"
              style={{
                background: 'rgba(255,85,85,0.05)',
                border: '1px solid rgba(255,85,85,0.4)',
              }}
            >
              <span className="text-xs flex-1" style={{ color: '#ffd6d6' }}>
                ⚠ Scorch <strong>{currentSite}</strong>? (logs you out)
              </span>
              <button
                onClick={executeClear}
                className="hud-btn hud-btn-danger"
                style={{ fontSize: '0.7rem', padding: '0.25rem 0.6rem' }}
                aria-label="Confirm clear"
              >
                Yes
              </button>
              <button
                onClick={cancelConfirm}
                className="hud-btn"
                style={{ fontSize: '0.7rem', padding: '0.25rem 0.6rem' }}
                aria-label="Cancel"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Operation legend */}
          <div className="mt-2 flex gap-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <span>🔄 <em>Refresh</em> — telemetry wiped, session intact</span>
          </div>
          <div className="flex gap-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <span>🗑️ <em>Clear</em> — scorched earth, logged out</span>
          </div>
        </div>

        {/* Settings */}
        <div className="hud-section">
          <h3 className="hud-title" style={{ fontSize: '0.7rem' }}>SETTINGS</h3>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={autoReload}
              onChange={(e) => saveAutoReload(e.target.checked)}
              className="w-4 h-4 rounded"
              style={{ accentColor: 'var(--accent-cyan)' }}
              aria-label="Auto-reload page after operation"
            />
            <span className="text-xs" style={{ color: 'var(--text-primary)' }}>
              Auto-reload page after operation
            </span>
          </label>
        </div>

        {/* Last operation summary */}
        {lastOp && (
          <div className="hud-section">
            <h3 className="hud-title" style={{ fontSize: '0.7rem' }}>LAST OPERATION</h3>
            <div className="grid grid-cols-2 gap-1 text-xs">
              <span style={{ color: 'var(--text-secondary)' }}>Type:</span>
              <span style={{ color: 'var(--accent-cyan)' }} className="font-mono uppercase">
                {lastOp.operation}
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>Cookies wiped:</span>
              <span style={{ color: 'var(--accent-cyan)' }} className="font-mono">
                {lastOp.cookiesWiped}
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>Vectors:</span>
              <span style={{ color: 'var(--text-cyan-active)' }}>
                ✓ {lastOp.vectorsSwept.length} swept
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>At:</span>
              <span style={{ color: 'var(--text-secondary)' }} className="font-mono">
                {new Date(lastOp.timestamp).toLocaleTimeString()}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SiteClearanceManager;
