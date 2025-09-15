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
    <div className="w-full h-full bg-gray-900">
      <div className="bg-gray-800 shadow-sm border-b border-gray-700">
        <div className="px-4 py-3">
          <h1 className="text-lg font-bold text-cyan-400">4ndr0tools</h1>
          <p className="text-xs text-gray-400">Red-team Quality of Life</p>
        </div>
      </div>
      
      <TabNavigation 
        tabs={tabs} 
        activeTab={activeTab} 
        onTabChange={setActiveTab} 
      />
      
      <div className="bg-gray-900">
        {renderTabContent()}
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
