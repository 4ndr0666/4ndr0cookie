console.log('4ndr0tools Service Worker Loaded');

// Initialize extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('4ndr0tools extension installed');
});

// Handle Alt+C command for site clearance
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'clear-site-data') {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.url || !tab.id) return;

      const url = new URL(tab.url);
      const origin = url.origin;

      // Clear all site data
      await chrome.browsingData.remove({ origins: [origin] }, {
        cookies: true,
        localStorage: true,
        indexedDB: true,
        webSQL: true,
        cache: true,
        serviceWorkers: true,
      });

      // Clear sessionStorage via content script
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          try {
            sessionStorage.clear();
          } catch (e) {
            console.error('SessionStorage clear failed:', e);
          }
        },
      });

      // Show success badge
      chrome.action.setBadgeText({ text: '✓', tabId: tab.id });
      chrome.action.setBadgeBackgroundColor({ color: '#15FFFF', tabId: tab.id });
      
      // Clear badge after 2 seconds
      setTimeout(() => {
        chrome.action.setBadgeText({ text: '', tabId: tab.id });
      }, 2000);

      // Auto-reload if enabled
      const { autoReload } = await chrome.storage.local.get(['autoReload']);
      if (autoReload !== false) {
        chrome.tabs.reload(tab.id);
      }

    } catch (error) {
      console.error('Site clearance failed:', error);
      
      // Show error badge
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab.id) {
        chrome.action.setBadgeText({ text: '✗', tabId: tab.id });
        chrome.action.setBadgeBackgroundColor({ color: '#FF4444', tabId: tab.id });
        
        setTimeout(() => {
          chrome.action.setBadgeText({ text: '', tabId: tab.id });
        }, 2000);
      }
    }
  }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // This listener is kept for potential future actions, but clearSiteData is now handled client-side.
  sendResponse({ success: false, error: 'Unknown action' });
});
