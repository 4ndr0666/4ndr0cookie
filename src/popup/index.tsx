import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import './popup.css';

// Import the tab navigation and our individual tab components.  Existing
// components come from the repository, while PasteManager is added to
// bring the legacy paste functionality into the unified extension.
import TabNavigation from '../components/TabNavigation';
import EmailListManager from '../components/EmailListManager';
import SiteClearanceManager from '../components/SiteClearanceManager';
import CookieManager from '../components/CookieManager';
import PasteManager from '../components/PasteManager';

// Define the available tabs.  Each tab has a unique id and a user-facing
// label.  Icons are optional and currently unused but left in place for
// future expansion.
const tabs = [
  { id: 'emails', label: 'Email Lists', icon: '' },
  { id: 'clearance', label: 'Site Clear', icon: '' },
  { id: 'cookies', label: 'Cookie Tools', icon: '' },
  { id: 'paste', label: 'Quick Paste', icon: '' },
];

const Popup: React.FC = () => {
  const [activeTab, setActiveTab] = useState('emails');

  // Render the appropriate component based on the active tab.  When
  // adding new tabs, extend this switch statement accordingly.
  const renderTabContent = () => {
    switch (activeTab) {
      case 'emails':
        return <EmailListManager />;
      case 'clearance':
        return <SiteClearanceManager />;
      case 'cookies':
        return <CookieManager />;
      case 'paste':
        return <PasteManager />;
      default:
        return null;
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-1">4ndr0cookie</h1>
      <p className="text-sm mb-3">Red-team Quality of Life</p>
      <TabNavigation tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="mt-4">
        {renderTabContent()}
      </div>
    </div>
  );
};

// Render the popup into the root container.  This uses the new
// React 18 createRoot API.
const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<Popup />);