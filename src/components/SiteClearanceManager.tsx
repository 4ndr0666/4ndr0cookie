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

  const saveSettings = async (value: boolean) => {
    try {
      await chrome.storage.local.set({ autoReload: value });
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
    <div className="hud-scroll space-y-4">
      <section className="hud-section">
        <div className="hud-section-header">
          <div>
            <h2 className="hud-section-title">Site clearance manager</h2>
            <p className="hud-section-subtitle">Press Alt+C to clear all site data instantly</p>
          </div>
          <span className="hud-chip">
            <span className="hud-chip__dot" />
            {currentSite ? currentSite : 'Unknown site'}
          </span>
        </div>
      </section>

      <section className="hud-section">
        <h3 className="hud-section-title">Quick clear</h3>
        <div className="hud-hotkey">
          <span className="hud-hotkey__icon" aria-hidden="true">⌨️</span>
          <div>
            <div className="hud-hotkey__title">Alt + C</div>
            <p className="hud-subtext">Instantly purge cookies, storage, indexedDB, webSQL, and cache for this site.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={clearSiteData}
          disabled={isClearing}
          className="hud-btn"
          data-variant="danger"
          data-block="true"
        >
          {isClearing ? '🔄 Clearing…' : '🗑️ Clear site data now'}
        </button>
      </section>

      <section className="hud-section">
        <h3 className="hud-section-title">Site cookie export</h3>
        <p className="hud-subtext">Export cookies for the current site as a JSON file.</p>
        <button
          type="button"
          onClick={exportSiteCookies}
          disabled={!currentSite}
          className="hud-btn"
          data-variant="accent"
          data-block="true"
        >
          Export site cookies
        </button>
      </section>

      <section className="hud-section hud-section--inline">
        <h3 className="hud-section-title">Settings</h3>
        <label className="hud-toggle">
          <input
            type="checkbox"
            checked={autoReload}
            onChange={(e) => {
              const value = e.target.checked;
              setAutoReload(value);
              saveSettings(value);
            }}
            className="hud-toggle__input"
          />
          <span className="hud-toggle__label">Auto-reload page after clearing</span>
        </label>
      </section>

      {lastClearance && (
        <section className="hud-section hud-section--inline">
          <h3 className="hud-section-title">Last clearance</h3>
          <div className="hud-stat-grid">
            <span className="hud-subtext">Cookies cleared</span>
            <span className="hud-subtext hud-subtext--mono">{lastClearance.cookies}</span>
            <span className="hud-subtext">Storage cleared</span>
            <span className="hud-subtext">✓ Local, session, indexedDB, webSQL</span>
          </div>
        </section>
      )}

      <section className="hud-section hud-section--inline">
        <h3 className="hud-section-title">Keyboard shortcut</h3>
        <div className="hud-keyboard">
          <kbd>Alt</kbd>
          <span>+</span>
          <kbd>C</kbd>
          <span className="hud-subtext">Clear current site data</span>
        </div>
      </section>
    </div>
  );
};

export default SiteClearanceManager;
