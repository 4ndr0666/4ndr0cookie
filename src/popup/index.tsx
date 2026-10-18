/**
 * popup/index.tsx
 *
 * Four-module popup: Site Clear · Cookie Tools · Vault · Backup/Restore.
 * Feature flags set in the Options page gate each module (default: enabled).
 * Supports `?tab=<id>` query parameter when opened in a persistent browser tab.
 */

import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import '../index.css';

import TabNavigation from '../components/TabNavigation';
import SiteClearanceManager from '../components/SiteClearanceManager';
import CookieManager from '../components/CookieManager';
import CredentialVault from '../components/CredentialVault';
import CookieBackupManager from '../components/CookieBackupManager';

interface FeatureFlags {
  siteClearanceEnabled: boolean;
  vaultEnabled: boolean;
  cookieBackupEnabled: boolean;
}

const DEFAULT_FLAGS: FeatureFlags = {
  siteClearanceEnabled: true,
  vaultEnabled: true,
  cookieBackupEnabled: true,
};

const tabs = [
  { id: 'clearance', label: 'Site Clear', icon: '🗑️' },
  { id: 'cookies',   label: 'Cookie Tools', icon: '🍪' },
  { id: 'vault',     label: 'Vault', icon: '🔐' },
  { id: 'backup',    label: 'Backup', icon: '💾' },
];

const resolveInitialTab = (): string => {
  try {
    const search = typeof location !== 'undefined' ? location.search : '';
    if (search) {
      const requested = new URLSearchParams(search).get('tab');
      if (requested && tabs.some((t) => t.id === requested)) {
        return requested;
      }
    }
  } catch {
    // Fallback to default tab
  }
  return 'clearance';
};

const DisabledModule: React.FC<{ name: string }> = ({ name }) => (
  <div className="hud-card p-6 text-center">
    <p className="hud-title" style={{ fontSize: '0.75rem' }}>{name} disabled</p>
    <p className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
      Re-enable this module in the extension Options page.
    </p>
  </div>
);

const Popup: React.FC = () => {
  const [activeTab, setActiveTab] = useState(resolveInitialTab);
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FLAGS);

  useEffect(() => {
    chrome.storage.local
      .get(Object.keys(DEFAULT_FLAGS))
      .then((stored) => {
        setFlags({
          siteClearanceEnabled: stored.siteClearanceEnabled !== false,
          vaultEnabled: stored.vaultEnabled !== false,
          cookieBackupEnabled: stored.cookieBackupEnabled !== false,
        });
      })
      .catch(console.error);
  }, []);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'clearance':
        return flags.siteClearanceEnabled
          ? <SiteClearanceManager />
          : <DisabledModule name="Site Clearance" />;
      case 'cookies':
        return <CookieManager />;
      case 'vault':
        return flags.vaultEnabled
          ? <CredentialVault />
          : <DisabledModule name="Credential Vault" />;
      case 'backup':
        return flags.cookieBackupEnabled
          ? <CookieBackupManager />
          : <DisabledModule name="Cookie Backup/Restore" />;
      default:
        return null;
    }
  };

  return (
    <div className="p-4">
      <h1
        className="hud-title text-center"
        style={{ fontFamily: 'var(--font-glyph)', fontSize: '1rem', marginBottom: '0.25rem' }}
      >
        4ndr0cookie
      </h1>
      <p className="text-xs text-center mb-3" style={{ color: 'var(--text-secondary)' }}>
        Red-team Quality of Life
      </p>
      <TabNavigation tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="mt-4">{renderTabContent()}</div>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<Popup />);
