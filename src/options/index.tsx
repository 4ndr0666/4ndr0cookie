/**
 * options/index.tsx
 *
 * Settings page. Every toggle here is live-wired:
 *
 *   siteClearanceEnabled   → gates Alt+C handler (SW) + Site Clear buttons (popup)
 *   autoReload             → post-operation reload (SW + popup) — runtime truth
 *                            lives in chrome.storage.local so the popup toggle
 *                            and the Options toggle always agree
 *   showBadgeNotifications → gates ✓/✗ badge feedback (SW + popup)
 *   cookieBackupEnabled    → gates the Backup/Restore popup module
 *   vaultEnabled           → gates the Credential Vault popup module
 *                            (successor of v1.0.1's emailListsEnabled)
 *   syncSettings           → when on, settings replicate via chrome.storage.sync;
 *                            runtime-consumed keys are always mirrored to local
 */

import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import '../index.css';
import { downloadBackupFile } from '../modules/cookie-backup';

interface Settings {
  siteClearanceEnabled: boolean;
  cookieBackupEnabled: boolean;
  vaultEnabled: boolean;
  autoReload: boolean;
  showBadgeNotifications: boolean;
  syncSettings: boolean;
}

const defaultSettings: Settings = {
  siteClearanceEnabled: true,
  cookieBackupEnabled: true,
  vaultEnabled: true,
  autoReload: true,
  showBadgeNotifications: true,
  syncSettings: true,
};

/** Keys consumed at runtime by SW / popup — always mirrored to storage.local. */
const RUNTIME_KEYS: (keyof Settings)[] = [
  'siteClearanceEnabled',
  'cookieBackupEnabled',
  'vaultEnabled',
  'autoReload',
  'showBadgeNotifications',
];

const Options = () => {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    try {
      const [local, sync] = await Promise.all([
        chrome.storage.local.get(Object.keys(defaultSettings)),
        chrome.storage.sync.get(Object.keys(defaultSettings)),
      ]);
      const useSync = (local.syncSettings ?? sync.syncSettings ?? true) !== false;
      const source = useSync ? sync : local;
      setSettings(normalizeSettings({ ...source, ...pickDefined(local, RUNTIME_KEYS) }));
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const saveSettings = async () => {
    setIsSaving(true);
    setSaveStatus('idle');
    try {
      // Primary store: sync (when enabled) or local
      await (settings.syncSettings ? chrome.storage.sync : chrome.storage.local).set(settings);
      // Runtime mirror: the SW and popup read these keys from storage.local
      const mirror = pickDefined(settings, RUNTIME_KEYS);
      await chrome.storage.local.set(mirror);
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
    downloadBackupFile(
      JSON.stringify(settings, null, 2),
      '4ndr0cookie-settings.json',
      'application/json',
    ).catch(console.error);
  };

  const importSettings = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const imported = JSON.parse(e.target?.result as string);
        setSettings(normalizeSettings({ ...defaultSettings, ...imported }));
      } catch {
        alert('Invalid settings file');
      } finally {
        event.target.value = '';
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
              <h2 className="hud-title">Cookie Tools</h2>
              <div className="hud-section space-y-4">
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
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      Enable Credential Vault
                    </label>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      Throwaway identity rotation tracker (email + password pairs)
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.vaultEnabled}
                    onChange={(e) => updateSetting('vaultEnabled', e.target.checked)}
                    style={{ accentColor: 'var(--accent-cyan)' }}
                    className="h-4 w-4"
                    aria-label="Enable credential vault"
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

/* ── helpers ── */

/** Copy only defined keys (runtime truth overrides stored defaults). */
function pickDefined<T extends object>(source: T, keys: (keyof T)[]): Partial<T> {
  const out: Partial<T> = {};
  for (const key of keys) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

/** Coerce a raw storage object into a fully-typed Settings record. */
function normalizeSettings(raw: Record<string, unknown>): Settings {
  const out = { ...defaultSettings };
  for (const key of Object.keys(defaultSettings) as (keyof Settings)[]) {
    if (typeof raw[key] === 'boolean') out[key] = raw[key] as boolean;
  }
  return out;
}

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<React.StrictMode><Options /></React.StrictMode>);
