import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import './options.css';

interface Settings {
  emailListsEnabled: boolean;
  siteClearanceEnabled: boolean;
  cookieBackupEnabled: boolean;
  autoReload: boolean;
  showBadgeNotifications: boolean;
  syncSettings: boolean;
}

const defaultSettings: Settings = {
  emailListsEnabled: true,
  siteClearanceEnabled: true,
  cookieBackupEnabled: true,
  autoReload: true,
  showBadgeNotifications: true,
  syncSettings: true,
};

const Options = () => {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const result = await chrome.storage.sync.get(Object.keys(defaultSettings));
      const loadedSettings = { ...defaultSettings, ...result };
      setSettings(loadedSettings);
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const saveSettings = async () => {
    setIsSaving(true);
    setSaveStatus('idle');
    
    try {
      await chrome.storage.sync.set(settings);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('Error saving settings:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } finally {
      setIsSaving(false);
    }
  };

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const resetToDefaults = () => {
    setSettings(defaultSettings);
  };

  const exportSettings = () => {
    const dataStr = JSON.stringify(settings, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = '4ndr0cookie-settings.json';
    link.click();
    
    URL.revokeObjectURL(url);
  };

  const importSettings = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedSettings = JSON.parse(e.target?.result as string);
        setSettings({ ...defaultSettings, ...importedSettings });
      } catch (error) {
        console.error('Error importing settings:', error);
        alert('Invalid settings file');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800 py-4 sm:py-8">
      <div className="max-w-4xl mx-auto px-3 sm:px-4">
        <div className="hud-card">
          {/* Header */}
          <div className="border-b border-cyan-300/20 px-4 sm:px-6 py-3 sm:py-4">
            <h1 className="text-xl sm:text-2xl font-bold" style={{ color: '#15FFFF' }}>4ndr0cookie Settings</h1>
            <p className="text-sm text-gray-400 mt-1">
              Configure your red-team quality of life tool preferences
            </p>
          </div>

          {/* Settings Content */}
          <div className="p-4 sm:p-6 space-y-6 sm:space-y-8">
            {/* Email Lists */}
            <section>
              <h2 className="hud-title">Email List Manager</h2>
              <div className="hud-section space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-gray-300">
                      Enable Email List Management
                    </label>
                    <p className="text-xs text-gray-500">
                      Manage multiple email groups for engagements
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.emailListsEnabled}
                    onChange={(e) => updateSetting('emailListsEnabled', e.target.checked)}
                    className="h-4 w-4 text-cyan-400 rounded border-cyan-300/30 bg-white/10 focus:ring-cyan-400"
                  />
                </div>
              </div>
            </section>

            {/* Site Clearance */}
            <section>
              <h2 className="hud-title">Site Clearance</h2>
              <div className="hud-section space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-gray-300">
                      Enable Site Data Clearance
                    </label>
                    <p className="text-xs text-gray-500">
                      Clear cookies, storage, and cache for current site (Alt+C)
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.siteClearanceEnabled}
                    onChange={(e) => updateSetting('siteClearanceEnabled', e.target.checked)}
                    className="h-4 w-4 text-cyan-400 rounded border-cyan-300/30 bg-white/10 focus:ring-cyan-400"
                  />
                </div>

                {settings.siteClearanceEnabled && (
                  <>
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-sm font-medium text-gray-300">
                          Auto-reload after clearance
                        </label>
                        <p className="text-xs text-gray-500">
                          Automatically reload page after clearing site data
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.autoReload}
                        onChange={(e) => updateSetting('autoReload', e.target.checked)}
                        className="h-4 w-4 text-cyan-400 rounded border-cyan-300/30 bg-white/10 focus:ring-cyan-400"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-sm font-medium text-gray-300">
                          Show badge notifications
                        </label>
                        <p className="text-xs text-gray-500">
                          Display success/error badges on extension icon
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.showBadgeNotifications}
                        onChange={(e) => updateSetting('showBadgeNotifications', e.target.checked)}
                        className="h-4 w-4 text-cyan-400 rounded border-cyan-300/30 bg-white/10 focus:ring-cyan-400"
                      />
                    </div>
                  </>
                )}
              </div>
            </section>

            {/* Cookie Backup */}
            <section>
              <h2 className="hud-title">Cookie Backup & Restore</h2>
              <div className="hud-section space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-gray-300">
                      Enable Cookie Backup/Restore
                    </label>
                    <p className="text-xs text-gray-500">
                      Encrypted system-wide cookie backup and restore functionality
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.cookieBackupEnabled}
                    onChange={(e) => updateSetting('cookieBackupEnabled', e.target.checked)}
                    className="h-4 w-4 text-cyan-400 rounded border-cyan-300/30 bg-white/10 focus:ring-cyan-400"
                  />
                </div>
              </div>
            </section>

            {/* General Settings */}
            <section>
              <h2 className="hud-title">General</h2>
              <div className="hud-section space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-gray-300">
                      Sync Settings
                    </label>
                    <p className="text-xs text-gray-500">
                      Synchronize settings across devices
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.syncSettings}
                    onChange={(e) => updateSetting('syncSettings', e.target.checked)}
                    className="h-4 w-4 text-cyan-400 rounded border-cyan-300/30 bg-white/10 focus:ring-cyan-400"
                  />
                </div>
              </div>
            </section>

            {/* Keyboard Shortcuts Info */}
            <section>
              <h2 className="hud-title">Keyboard Shortcuts</h2>
              <div className="hud-section">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-300">Clear site data</span>
                    <kbd className="px-2 py-1 text-xs font-mono bg-gray-600 text-cyan-400 rounded">Alt+C</kbd>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-3">
                  Note: Keyboard shortcuts work on any webpage when the extension is active.
                </p>
              </div>
            </section>
          </div>

          {/* Actions */}
          <div className="border-t border-cyan-300/20 px-4 sm:px-6 py-3 sm:py-4">
            <div className="flex items-center justify-between">
              <div className="flex space-x-3">
                <button
                  onClick={exportSettings}
                  className="hud-btn"
                >
                  Export Settings
                </button>
                
                <label className="hud-btn cursor-pointer">
                  Import Settings
                  <input
                    type="file"
                    accept=".json"
                    onChange={importSettings}
                    className="hidden"
                  />
                </label>

                <button
                  onClick={resetToDefaults}
                  className="hud-btn hud-btn-danger"
                >
                  Reset to Defaults
                </button>
              </div>

              <div className="flex items-center space-x-3">
                {saveStatus === 'success' && (
                  <span className="text-sm text-green-400">Settings saved!</span>
                )}
                {saveStatus === 'error' && (
                  <span className="text-sm text-red-400">Error saving settings</span>
                )}
                
                <button
                  onClick={saveSettings}
                  disabled={isSaving}
                  className={`hud-btn ${isSaving ? 'opacity-70 cursor-not-allowed' : ''}`}
                >
                  {isSaving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <Options />
  </React.StrictMode>
);
