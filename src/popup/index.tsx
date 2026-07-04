import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import '../index.css';

import TabNavigation from '../components/TabNavigation';
import SiteClearanceManager from '../components/SiteClearanceManager';
import CookieManager from '../components/CookieManager';
import CredentialVault from '../components/CredentialVault';

const tabs = [
  { id: 'clearance', label: 'Site Clear', icon: '' },
  { id: 'cookies',   label: 'Cookie Tools', icon: '' },
  { id: 'vault',     label: 'Vault', icon: '' },
];

const Popup: React.FC = () => {
  const [activeTab, setActiveTab] = useState('clearance');

  const renderTabContent = () => {
    switch (activeTab) {
      case 'clearance': return <SiteClearanceManager />;
      case 'cookies':   return <CookieManager />;
      case 'vault':     return <CredentialVault />;
      default:          return null;
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
