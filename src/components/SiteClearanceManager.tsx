import React, { useState, useEffect } from 'react';

interface ClearanceStats {
  cookies: number;
  localStorage: number;
  sessionStorage: number;
  indexedDB: number;
  webSQL: number;
  cache: number;
}

const SiteClearanceManager: React.FC = () => {
  const [currentSite, setCurrentSite] = useState<string>('');
  const [isClearing, setIsClearing] = useState(false);
  const [lastClearance, setLastClearance] = useState<ClearanceStats | null>(null);
  const [autoReload, setAutoReload] = useState(true);

  useEffect(() => {
    getCurrentSite();
    loadSettings();
  }, []);

  const getCurrentSite = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab.url) {
        const url = new URL(tab.url);
        setCurrentSite(url.hostname);
      }
    } catch (error) {
      console.error('Error getting current site:', error);
    }
  };

  const loadSettings = async () => {
    try {
      const result = await chrome.storage.local.get(['autoReload']);
      if (result.autoReload !== undefined) {
        setAutoReload(result.autoReload);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const saveSettings = async () => {
    try {
      await chrome.storage.local.set({ autoReload });
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  };

  const clearSiteData = async () => {
    if (!currentSite) return;
    
    setIsClearing(true);
    const stats: ClearanceStats = {
      cookies: 0,
      localStorage: 0,
      sessionStorage: 0,
      indexedDB: 0,
      webSQL: 0,
      cache: 0
    };

    try {
      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.url) return;

      const url = new URL(tab.url);
      const origin = url.origin;

      // Clear cookies
      const cookies = await chrome.cookies.getAll({ domain: url.hostname });
      for (const cookie of cookies) {
        const protocol = cookie.secure ? 'https:' : 'http:';
        const cookieUrl = `${protocol}//${cookie.domain}${cookie.path}`;
        await chrome.cookies.remove({ url: cookieUrl, name: cookie.name });
        stats.cookies++;
      }

      // Clear browsing data for the specific origin
      await chrome.browsingData.remove(
        { origins: [origin] },
        {
          cookies: true,
          localStorage: true,
          indexedDB: true,
          webSQL: true,
          cache: true
        }
      );
        
      // Clear sessionStorage separately via content script
      if (tab.id) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            try {
              sessionStorage.clear();
            } catch (e) {
              console.log('SessionStorage clear failed:', e);
            }
          }
        });
      }

      // Set badge to indicate success
      chrome.action.setBadgeText({ text: "✅" });
      chrome.action.setBadgeBackgroundColor({ color: "#15FFFF" });
      
      setTimeout(() => {
        chrome.action.setBadgeText({ text: "" });
      }, 2000);

      setLastClearance(stats);

      // Auto-reload if enabled
      if (autoReload && tab.id) {
        setTimeout(() => {
          chrome.tabs.reload(tab.id!);
        }, 500);
      }

    } catch (error) {
      console.error('Error clearing site data:', error);
      chrome.action.setBadgeText({ text: "❌" });
      setTimeout(() => {
        chrome.action.setBadgeText({ text: "" });
      }, 2000);
    } finally {
      setIsClearing(false);
    }
  };

  const exportSiteCookies = async () => {
    if (!currentSite) return;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.url) return;

      const url = new URL(tab.url);
      const cookies = await chrome.cookies.getAll({ domain: url.hostname });
      
      if (cookies.length === 0) {
        alert('No cookies found for this site');
        return;
      }

      const dataStr = JSON.stringify(cookies, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
      
      const exportFileName = `cookies_${currentSite}_${new Date().toISOString().split('T')[0]}.json`;
      
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileName);
      linkElement.click();

    } catch (error) {
      console.error('Error exporting site cookies:', error);
    }
  };

  return (
    <div className="min-h-full bg-gray-900 text-gray-100">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 p-4">
        <h2 className="text-lg font-semibold mb-2" style={{color: '#15FFFF'}}>Site Clearance Manager</h2>
        <p className="text-sm text-gray-400">Press Alt+C to clear all site data instantly</p>
      </div>
      <div className="text-sm text-gray-400">
        Current Site: <span className="text-cyan-400 font-mono">{currentSite || 'Unknown'}</span>
      </div>

      {/* Main Actions */}
      <div className="p-4 space-y-4">
        {/* Quick Clear Button */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <h3 className="text-md font-medium text-cyan-400 mb-3">Quick Clear (Alt+C)</h3>
          <div className="space-y-3">
            <div className="text-center p-4 bg-gray-800 rounded-lg border-2" style={{borderColor: '#15FFFF'}}>
              <div className="text-2xl mb-2">⌨️</div>
              <div className="text-lg font-bold" style={{color: '#15FFFF'}}>Alt + C</div>
              <div className="text-sm text-gray-400 mt-1">Quick Site Clear Hotkey</div>
            </div>
            
            <button
              onClick={clearSiteData}
              disabled={isClearing}
              className={`w-full py-3 px-4 rounded font-medium transition-colors ${
                isClearing
                  ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  : 'bg-red-600 text-white hover:bg-red-500'
              }`}
            >
              {isClearing ? '🔄 Clearing...' : '🗑️ Manual Clear Site Data'}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Clears cookies, localStorage, sessionStorage, indexedDB, webSQL, and cache for this site only
          </p>
        </div>

        {/* Site-Specific Cookie Export */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <h3 className="text-md font-medium text-cyan-400 mb-3">Site Cookie Export</h3>
          <button
            onClick={exportSiteCookies}
            disabled={!currentSite}
            className="w-full py-2 px-4 bg-cyan-400 text-gray-900 rounded font-medium hover:bg-cyan-300 transition-colors disabled:bg-gray-600 disabled:text-gray-400"
          >
            Export Site Cookies
          </button>
          <p className="text-xs text-gray-500 mt-2">
            Export cookies for the current site as JSON file
          </p>
        </div>

        {/* Settings */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <h3 className="text-md font-medium text-cyan-400 mb-3">Settings</h3>
          <label className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={autoReload}
              onChange={(e) => {
                setAutoReload(e.target.checked);
                saveSettings();
              }}
              className="w-4 h-4 text-cyan-400 bg-gray-700 border-gray-600 rounded focus:ring-cyan-400"
            />
            <span className="text-sm text-gray-300">Auto-reload page after clearing</span>
          </label>
        </div>

        {/* Last Clearance Stats */}
        {lastClearance && (
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
            <h3 className="text-md font-medium text-cyan-400 mb-3">Last Clearance</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-gray-400">Cookies cleared:</div>
              <div className="text-cyan-400 font-mono">{lastClearance.cookies}</div>
              <div className="text-gray-400">Storage cleared:</div>
              <div className="text-cyan-400">✓ All types</div>
            </div>
          </div>
        )}

        {/* Keyboard Shortcut Info */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <h3 className="text-md font-medium text-cyan-400 mb-2">Keyboard Shortcut</h3>
          <div className="flex items-center space-x-2">
            <kbd className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs font-mono">Alt</kbd>
            <span className="text-gray-400">+</span>
            <kbd className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs font-mono">C</kbd>
            <span className="text-sm text-gray-400 ml-2">Clear current site data</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SiteClearanceManager;
