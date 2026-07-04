import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import '../index.css';

interface Settings {
  siteClearanceEnabled: boolean;
  cookieBackupEnabled: boolean;
  autoReload: boolean;
  showBadgeNotifications: boolean;
  syncSettings: boolean;
}

const defaultSettings: Settings = {
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

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    try {
      const result = await chrome.storage.sync.get(Object.keys(defaultSettings));
      setSettings({ ...defaultSettings, ...result });
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
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const resetToDefaults = () => setSettings(defaultSettings);

  const exportSettings = () => {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '4ndr0cookie-settings.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const importSettings = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string);
        setSettings({ ...defaultSettings, ...imported });
      } catch {
        alert('Invalid settings file');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div>
      <div className="max-w-4xl mx-auto px-3 sm:px-4">
        <div className="hud-card">
          <div className="border-b px-4 sm:px-6 py-3 sm:py-4"
            style={{ borderColor: 'var(--accent-cyan-border-idle)' }}>
            <h1 className="text-xl font-bold" style={{ color: 'var(--accent-cyan)', fontFamily: 'var(--font-glyph)' }}>
              4ndr0cookie Settings
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
              Configure your red-team quality of life tool preferences
            </p>
          </div>

          <div className="p-4 sm:p-6 space-y-6">

            <section>
              <h2 className="hud-title">Site Clearance</h2>
              <div className="hud-section space-y-4">
                {[
                  { key: 'siteClearanceEnabled' as const, label: 'Enable Site Data Clearance', desc: 'Alt+C shortcut and popup clear/refresh buttons' },
                  { key: 'autoReload' as const, label: 'Auto-reload after operation', desc: 'Automatically reload page after clear or refresh' },
                  { key: 'showBadgeNotifications' as const, label: 'Show badge notifications', desc: 'Display ✓/✗ badges on extension icon' },
                ].map(({ key, label, desc }) => (
                  <div key={key} className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</label>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{desc}</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings[key] as boolean}
                      onChange={(e) => updateSetting(key, e.target.checked)}
                      style={{ accentColor: 'var(--accent-cyan)' }}
                      className="h-4 w-4"
                      aria-label={label}
                    />
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2 className="hud-title">Cookie Backup &amp; Restore</h2>
              <div className="hud-section">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      Enable Cookie Backup/Restore
                    </label>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      Encrypted system-wide cookie backup and restore
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.cookieBackupEnabled}
                    onChange={(e) => updateSetting('cookieBackupEnabled', e.target.checked)}
                    style={{ accentColor: 'var(--accent-cyan)' }}
                    className="h-4 w-4"
                    aria-label="Enable cookie backup"
                  />
                </div>
              </div>
            </section>

            <section>
              <h2 className="hud-title">General</h2>
              <div className="hud-section">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Sync Settings</label>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Synchronize settings across devices</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.syncSettings}
                    onChange={(e) => updateSetting('syncSettings', e.target.checked)}
                    style={{ accentColor: 'var(--accent-cyan)' }}
                    className="h-4 w-4"
                    aria-label="Sync settings"
                  />
                </div>
              </div>
            </section>

            <section>
              <h2 className="hud-title">Keyboard Shortcuts</h2>
              <div className="hud-section space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Clear site data (scorched earth)</span>
                  <kbd className="px-2 py-1 text-xs font-mono rounded"
                    style={{ background: 'rgba(0,0,0,0.4)', color: 'var(--accent-cyan)', border: '1px solid var(--accent-cyan-border-idle)' }}>
                    Alt+C
                  </kbd>
                </div>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Remap shortcuts at <code>chrome://extensions/shortcuts</code>
                </p>
              </div>
            </section>
          </div>

          <div className="border-t px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between"
            style={{ borderColor: 'var(--accent-cyan-border-idle)' }}>
            <div className="flex space-x-3">
              <button onClick={exportSettings} className="hud-btn" aria-label="Export settings">Export</button>
              <label className="hud-btn cursor-pointer" aria-label="Import settings">
                Import
                <input type="file" accept=".json" onChange={importSettings} className="hidden" />
              </label>
              <button onClick={resetToDefaults} className="hud-btn hud-btn-danger" aria-label="Reset to defaults">Reset</button>
            </div>
            <div className="flex items-center space-x-3">
              {saveStatus === 'success' && <span className="text-sm" style={{ color: '#4ade80' }}>Saved!</span>}
              {saveStatus === 'error' && <span className="text-sm" style={{ color: '#ff7777' }}>Error</span>}
              <button
                onClick={saveSettings}
                disabled={isSaving}
                className={`hud-btn ${isSaving ? 'opacity-70 cursor-not-allowed' : ''}`}
                aria-label="Save settings"
              >
                {isSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<React.StrictMode><Options /></React.StrictMode>);
