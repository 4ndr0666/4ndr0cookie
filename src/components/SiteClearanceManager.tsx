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
  const [sites, setSites] = useState<string[]>([]);
  const [isClearing, setIsClearing] = useState<string | null>(null); // Clearing state by site
  const [lastClearance, setLastClearance] = useState<ClearanceStats | null>(null);
  const [autoReload, setAutoReload] = useState(true);

  useEffect(() => {
    getCurrentSite();
    loadSettings();
    getSitesFromCookies();
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

  const getSitesFromCookies = async () => {
    try {
      const allCookies = await chrome.cookies.getAll({});
      const uniqueDomains = [...new Set(allCookies.map(cookie => cookie.domain.replace(/^\./, '')))];
      setSites(uniqueDomains.sort());
    } catch (error) {
      console.error('Error getting sites from cookies:', error);
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

  const clearSiteData = async (site: string) => {
    if (!site) return;
    
    setIsClearing(site);

    try {
      const origin = `https://${site}`;

      // Clear browsing data for the specific origin
      await chrome.browsingData.remove(
        { origins: [origin] },
        {
          appcache: true,
          cache: true,
          cookies: true,
          fileSystems: true,
          indexedDB: true,
          localStorage: true,
          serviceWorkers: true,
          webSQL: true,
        }
      );

      // Reload the site if it's the current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab.url && new URL(tab.url).hostname === site) {
        // Clear sessionStorage via content script
        if (tab.id) {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              try {
                sessionStorage.clear();
              } catch (e) {
                console.error('SessionStorage clear failed:', e);
              }
            }
          });
        }

        // Auto-reload if enabled
        if (autoReload && tab.id) {
          setTimeout(() => {
            chrome.tabs.reload(tab.id!);
          }, 500);
        }
      }

      // Set badge to indicate success
      chrome.action.setBadgeText({ text: "✅" });
      chrome.action.setBadgeBackgroundColor({ color: "#15FFFF" });
      
      setTimeout(() => {
        chrome.action.setBadgeText({ text: "" });
      }, 2000);

      // Refresh the list of sites
      getSitesFromCookies();

    } catch (error) {
      console.error(`Error clearing site data for ${site}:`, error);
      chrome.action.setBadgeText({ text: "❌" });
      setTimeout(() => {
        chrome.action.setBadgeText({ text: "" });
      }, 2000);
    } finally {
      setIsClearing(null);
    }
  };

  return (
    <div className="hud-card">
      {/* Header */}
      <div className="border-b border-cyan-300/20 px-4 sm:px-6 py-3 sm:py-4">
        <h2 className="hud-title">Site Clearance Manager</h2>
        <p className="text-sm text-gray-400">Press Alt+C to clear all site data instantly</p>
      </div>
      <div className="text-sm text-gray-400 p-4">
        <span className="hud-title">Current Site:</span> <span className="text-cyan-400 font-mono">{currentSite || 'Unknown'}</span>
      </div>

      {/* Main Actions */}
      <div className="p-4 space-y-4">
        {/* Quick Clear Button for Current Site */}
        <div className="hud-section">
          <h3 className="hud-title mb-3">Quick Clear Current Site (Alt+C)</h3>
          <button
            onClick={() => clearSiteData(currentSite)}
            disabled={isClearing === currentSite}
            className={`hud-btn w-full ${isClearing === currentSite ? 'opacity-70 cursor-not-allowed' : 'hud-btn-danger'}`}
          >
            {isClearing === currentSite ? `🔄 Clearing ${currentSite}...` : `🗑️ Clear ${currentSite} Data`}
          </button>
        </div>

        {/* All Sites List */}
        <div className="hud-section">
          <h3 className="hud-title mb-3">All Sites with Cookies</h3>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {sites.map(site => (
              <div key={site} className="flex items-center justify-between">
                <span className="text-sm text-gray-300">{site}</span>
                <button
                  onClick={() => clearSiteData(site)}
                  disabled={isClearing === site}
                  className={`hud-btn hud-btn-danger ml-2 ${isClearing === site ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                  {isClearing === site ? '🔄 Clearing...' : 'Clear'}
                </button>
              </div>
            ))}
          </div>
        </div>
        
        {/* Settings */}
        <div className="hud-section">
          <h3 className="hud-title mb-3">Settings</h3>
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
          <div className="hud-section">
            <h3 className="hud-title mb-3">Last Clearance</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="text-gray-400">Cookies cleared:</div>
              <div className="text-cyan-400 font-mono">{lastClearance.cookies}</div>
              <div className="text-gray-400">Storage cleared:</div>
              <div className="text-cyan-400">✓ All types</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SiteClearanceManager;
