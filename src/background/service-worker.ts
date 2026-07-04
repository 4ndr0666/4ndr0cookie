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
 */

import { scorchClientStorage } from '../lib/clearancePayload';

console.log('[4ndr0cookie] Service Worker loaded');

chrome.runtime.onInstalled.addListener(() => {
  console.log('[4ndr0cookie] Extension installed');
});

/* ─── Alt+C → CLEAR (scorched earth) ─── */
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'clear-site-data') return;

  let activeTabId: number | undefined;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.url || !tab.id) return;

    activeTabId = tab.id;
    const hostname = new URL(tab.url).hostname;
    const origins = [`https://${hostname}`, `http://${hostname}`] as [string, ...string[]];

    // Backend wipe — includes HttpOnly cookies, HTTP cache, AppCache, FileSystems
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

    chrome.action.setBadgeText({ text: '✓', tabId: tab.id });
    chrome.action.setBadgeBackgroundColor({ color: '#00E5FF', tabId: tab.id });
    setTimeout(() => chrome.action.setBadgeText({ text: '', tabId: activeTabId }), 2000);

    const { autoReload } = await chrome.storage.local.get(['autoReload']);
    if (autoReload !== false) chrome.tabs.reload(tab.id);

  } catch (error) {
    console.error('[4ndr0cookie] Alt+C clear failed:', error);
    if (activeTabId !== undefined) {
      chrome.action.setBadgeText({ text: '✗', tabId: activeTabId });
      chrome.action.setBadgeBackgroundColor({ color: '#FF4444', tabId: activeTabId });
      setTimeout(() => chrome.action.setBadgeText({ text: '', tabId: activeTabId }), 2000);
    }
  }
});

/* ─── Message bus — reserved for future popup↔background IPC ─── */
chrome.runtime.onMessage.addListener((_request, _sender, sendResponse) => {
  sendResponse({ success: false, error: 'Unknown action' });
});
