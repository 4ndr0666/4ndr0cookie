/**
 * service-worker.ts
 *
 * Background service worker — Manifest V3.
 *
 * Alt+C maps to the CLEAR (scorched earth) operation for parity with
 * prior behaviour. User may remap via chrome://extensions/shortcuts.
 *
 * Both refreshClientStorage and scorchClientStorage are imported from
 * the shared lib so the service-worker and popup paths are always
 * in sync.
 *
 * Options-page feature flags (chrome.storage.local) are honoured here:
 *   siteClearanceEnabled   — gates the whole operation
 *   showBadgeNotifications — gates ✓/✗ badge feedback
 *   autoReload             — gates the post-operation reload
 *
 * Runtime IPC message bus (`chrome.runtime.onMessage`):
 *   - "ping"                → health check & extension version
 *   - "get-settings"        → normalized runtime feature flags
 *   - "clear-site-data"     → scorched-earth clearance on active or target tab
 *   - "refresh-site-data"   → client-side refresh on active or target tab
 *   - "backup-cookies"      → background sanitized encrypted cookie backup
 *   - "restore-cookies"     → background cookie backup decryption & batch upsert
 *   - "vault-session-get"   → retrieve ephemeral unlocked vault session state
 *   - "vault-session-set"   → store ephemeral unlocked vault session state
 *   - "vault-session-clear" → wipe ephemeral unlocked vault session state
 */

import { refreshClientStorage, scorchClientStorage } from '../lib/clearancePayload';
import {
  collectAllBrowserCookies,
  encryptBackup,
  parseCookieBackup,
  restoreCookiesBatch,
  sanitizeCookies,
} from '../modules/cookie-backup';
import {
  clearSessionVaultCache,
  getSessionVaultCache,
  setSessionVaultCache,
  SiteGroup,
} from '../modules/credentialVault';

console.log('[4ndr0cookie] Service Worker loaded');

chrome.runtime.onInstalled.addListener(() => {
  console.log('[4ndr0cookie] Extension installed');
});

export interface ClearanceSettings {
  siteClearanceEnabled: boolean;
  cookieBackupEnabled: boolean;
  vaultEnabled: boolean;
  showBadgeNotifications: boolean;
  autoReload: boolean;
}

const DEFAULT_CLEARANCE_SETTINGS: ClearanceSettings = {
  siteClearanceEnabled: true,
  cookieBackupEnabled: true,
  vaultEnabled: true,
  showBadgeNotifications: true,
  autoReload: true,
};

export const isClearableHttpUrl = (rawUrl?: string): boolean => {
  if (!rawUrl) return false;
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

export const loadRuntimeSettings = async (): Promise<ClearanceSettings> => {
  const raw = await chrome.storage.local.get(Object.keys(DEFAULT_CLEARANCE_SETTINGS));
  return {
    siteClearanceEnabled: raw.siteClearanceEnabled !== false,
    cookieBackupEnabled: raw.cookieBackupEnabled !== false,
    vaultEnabled: raw.vaultEnabled !== false,
    showBadgeNotifications: raw.showBadgeNotifications !== false,
    autoReload: raw.autoReload !== false,
  };
};

const flashBadge = (tabId: number | undefined, text: string, color: string) => {
  if (tabId === undefined) return;
  chrome.action.setBadgeText({ text, tabId });
  chrome.action.setBadgeBackgroundColor({ color, tabId });
  setTimeout(() => chrome.action.setBadgeText({ text: '', tabId }), 2000);
};

export const runSiteClearance = async (
  mode: 'clear' | 'refresh',
  targetTabId?: number,
): Promise<{
  success: boolean;
  operation?: 'clear' | 'refresh';
  hostname?: string;
  cookiesWiped?: number;
  timestamp?: number;
  error?: string;
}> => {
  let activeTabId: number | undefined = targetTabId;

  try {
    const settings = await loadRuntimeSettings();
    if (!settings.siteClearanceEnabled) {
      return { success: false, error: 'Site clearance is disabled in Options.' };
    }

    let tab: chrome.tabs.Tab | undefined;
    if (typeof targetTabId === 'number') {
      const allTabs = await chrome.tabs.query({ currentWindow: true });
      tab = allTabs.find((t) => t.id === targetTabId);
    }
    if (!tab) {
      [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    }

    if (!tab || !tab.id || !isClearableHttpUrl(tab.url)) {
      return { success: false, error: 'No clearable HTTP/HTTPS tab active.' };
    }

    activeTabId = tab.id;
    const hostname = new URL(tab.url!).hostname;
    const allCookies = await chrome.cookies.getAll({ domain: hostname });

    if (mode === 'clear') {
      const origins = [
        `https://${hostname}`,
        `http://${hostname}`,
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

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scorchClientStorage,
      });
    } else {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: refreshClientStorage,
      });
    }

    const cookiesWiped =
      mode === 'clear'
        ? allCookies.length
        : allCookies.filter((c) => !c.httpOnly).length;

    if (settings.showBadgeNotifications) {
      flashBadge(tab.id, '✓', '#00E5FF');
    }

    if (settings.autoReload) {
      chrome.tabs.reload(tab.id);
    }

    return {
      success: true,
      operation: mode,
      hostname,
      cookiesWiped,
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error(`[4ndr0cookie] ${mode} failed:`, error);
    if (activeTabId !== undefined) {
      const { showBadgeNotifications } = await chrome.storage.local.get([
        'showBadgeNotifications',
      ]);
      if (showBadgeNotifications !== false) {
        flashBadge(activeTabId, '✗', '#FF4444');
      }
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

/* ─── Alt+C → CLEAR (scorched earth) ─── */
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'clear-site-data') return;
  await runSiteClearance('clear');
});

/* ─── Runtime IPC Message Bus ─── */
export interface RuntimeIPCRequest {
  action?: string;
  tabId?: number;
  groups?: SiteGroup[] | null;
  passphrase?: string | null;
  password?: string;
  payload?: string;
}

export const dispatchRuntimeMessage = async (
  request: RuntimeIPCRequest | null | undefined,
): Promise<Record<string, unknown>> => {
  const action = request?.action;
  switch (action) {
    case 'ping':
      return { success: true, version: '1.1.1' };

    case 'get-settings': {
      const settings = await loadRuntimeSettings();
      return { success: true, settings };
    }

    case 'clear-site-data':
      return await runSiteClearance('clear', request?.tabId);

    case 'refresh-site-data':
      return await runSiteClearance('refresh', request?.tabId);

    case 'backup-cookies': {
      const settings = await loadRuntimeSettings();
      if (!settings.cookieBackupEnabled) {
        return { success: false, error: 'Cookie backup is disabled in Options.' };
      }
      const password = typeof request?.password === 'string' ? request.password.trim() : '';
      if (!password) {
        return { success: false, error: 'Password is required for encrypted backups.' };
      }
      const allCookies = await collectAllBrowserCookies();
      const { cookies, report } = sanitizeCookies(allCookies);
      const encrypted = await encryptBackup(cookies, password);
      return {
        success: true,
        encrypted,
        report,
        totalCookies: allCookies.length,
      };
    }

    case 'restore-cookies': {
      const settings = await loadRuntimeSettings();
      if (!settings.cookieBackupEnabled) {
        return { success: false, error: 'Cookie backup is disabled in Options.' };
      }
      const payload = typeof request?.payload === 'string' ? request.payload : '';
      const password = typeof request?.password === 'string' ? request.password.trim() : undefined;
      const { cookies } = await parseCookieBackup(payload, password);
      const batchResult = await restoreCookiesBatch(cookies);
      return {
        success: true,
        ...batchResult,
      };
    }

    case 'vault-session-get': {
      const session = await getSessionVaultCache();
      return {
        success: true,
        unlocked: session.groups !== null,
        groups: session.groups,
      };
    }

    case 'vault-session-set': {
      await setSessionVaultCache(
        Array.isArray(request?.groups) ? request.groups : null,
        typeof request?.passphrase === 'string' ? request.passphrase : null,
      );
      return { success: true };
    }

    case 'vault-session-clear': {
      await clearSessionVaultCache();
      return { success: true };
    }

    default:
      return { success: false, error: 'Unknown action' };
  }
};

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  dispatchRuntimeMessage(request)
    .then((response) => sendResponse(response))
    .catch((err) =>
      sendResponse({
        success: false,
        error: err instanceof Error ? err.message : 'IPC dispatch failed',
      }),
    );
  return true;
});
