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
    link.download = '4ndr0tools-settings.json';
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
    <div className="min-h-screen bg-gray-900 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-gray-800 rounded-lg shadow-sm border border-gray-700">
          {/* Header */}
          <div className="border-b border-gray-700 px-6 py-4">
            <h1 className="text-2xl font-bold text-cyan-400">4ndr0tools Settings</h1>
            <p className="text-sm text-gray-400 mt-1">
              Configure your red-team quality of life tool preferences
            </p>
          </div>

          {/* Settings Content */}
          <div className="p-6 space-y-8">
            {/* Email Lists */}
            <section>
              <h2 className="text-lg font-semibold text-cyan-400 mb-4">Email List Manager</h2>
              <div className="space-y-4">
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
                    className="h-4 w-4 text-cyan-400 rounded border-gray-600 bg-gray-700 focus:ring-cyan-400"
                  />
                </div>
              </div>
            </section>

            {/* Site Clearance */}
            <section>
              <h2 className="text-lg font-semibold text-cyan-400 mb-4">Site Clearance</h2>
              <div className="space-y-4">
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
                    className="h-4 w-4 text-cyan-400 rounded border-gray-600 bg-gray-700 focus:ring-cyan-400"
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
                        className="h-4 w-4 text-cyan-400 rounded border-gray-600 bg-gray-700 focus:ring-cyan-400"
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
                        className="h-4 w-4 text-cyan-400 rounded border-gray-600 bg-gray-700 focus:ring-cyan-400"
                      />
                    </div>
                  </>
                )}
              </div>
            </section>

            {/* Cookie Backup */}
            <section>
              <h2 className="text-lg font-semibold text-cyan-400 mb-4">Cookie Backup & Restore</h2>
              <div className="space-y-4">
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
                    className="h-4 w-4 text-cyan-400 rounded border-gray-600 bg-gray-700 focus:ring-cyan-400"
                  />
                </div>
              </div>
            </section>

            {/* General Settings */}
            <section>
              <h2 className="text-lg font-semibold text-cyan-400 mb-4">General</h2>
              <div className="space-y-4">
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
                    className="h-4 w-4 text-cyan-400 rounded border-gray-600 bg-gray-700 focus:ring-cyan-400"
                  />
                </div>
              </div>
            </section>

            {/* Keyboard Shortcuts Info */}
            <section>
              <h2 className="text-lg font-semibold text-cyan-400 mb-4">Keyboard Shortcuts</h2>
              <div className="bg-gray-700 rounded-lg p-4">
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
          <div className="border-t border-gray-700 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex space-x-3">
                <button
                  onClick={exportSettings}
                  className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 border border-gray-600 rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                >
                  Export Settings
                </button>
                
                <label className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 border border-gray-600 rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-400 cursor-pointer">
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
                  className="px-4 py-2 text-sm font-medium text-red-400 bg-gray-700 border border-red-600 rounded-md hover:bg-red-900 focus:outline-none focus:ring-2 focus:ring-red-400"
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
                  className={`px-6 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-400 ${
                    isSaving
                      ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      : 'bg-cyan-400 text-gray-900 hover:bg-cyan-300'
                  }`}
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
