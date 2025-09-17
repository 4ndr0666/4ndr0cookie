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
    <div className="w-full h-full bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800">
      <div className="hud-card m-2">
        <div className="border-b border-cyan-300/20 px-4 py-3">
          <h1 className="text-lg font-bold" style={{ color: '#15FFFF' }}>4ndr0cookie</h1>
          <p className="text-xs text-gray-400">Red-team Quality of Life</p>
        </div>
        
        <TabNavigation 
          tabs={tabs} 
          activeTab={activeTab} 
          onTabChange={setActiveTab} 
        />
        
        <div className="p-3">
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
