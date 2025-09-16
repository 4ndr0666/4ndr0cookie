import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import './popup.css';
import TabNavigation from '../components/TabNavigation';
import EmailListManager from '../components/EmailListManager';
import SiteClearanceManager from '../components/SiteClearanceManager';
import CookieManager from '../components/CookieManager';
import CookieBackupManager from '../components/CookieBackupManager';

const tabs = [
  { id: 'emails', label: 'Email Lists', icon: '📧' },
  { id: 'clearance', label: 'Site Clear', icon: '🗑️' },
  { id: 'cookies', label: 'Cookie Tools', icon: '🍪' },
  { id: 'backup', label: 'Backup/Restore', icon: '💾' },
];

const Popup = () => {
  const [activeTab, setActiveTab] = useState('emails');

  const renderTabContent = () => {
    switch (activeTab) {
      case 'emails':
        return <EmailListManager />;
      case 'clearance':
        return <SiteClearanceManager />;
      case 'cookies':
        return <CookieManager />;
      case 'backup':
        return <CookieBackupManager />;
      default:
        return <EmailListManager />;
    }
  };

  return (
    <div className="hud-app">
      <div className="hud-backdrop hud-backdrop--grid" aria-hidden="true" />
      <div className="hud-backdrop hud-backdrop--pulse" aria-hidden="true" />
      <div className="hud-backdrop hud-backdrop--accent" aria-hidden="true" />

      <div className="hud-card">
        <header className="hud-card-header">
          <div>
            <h1 className="hud-card-title">4ndr0cookie</h1>
            <p className="hud-card-subtitle">Red-team quality of life toolkit</p>
          </div>
          <span className="hud-chip" data-variant="neutral">
            <span className="hud-chip__dot" />
            Operational
          </span>
        </header>

        <TabNavigation
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        <div className="hud-content">
          {renderTabContent()}
        </div>
      </div>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>
);
