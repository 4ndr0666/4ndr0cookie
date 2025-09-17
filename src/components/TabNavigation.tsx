import React from 'react';

interface Tab {
  id: string;
  label: string;
  icon: string;
}

interface TabNavigationProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

const TabNavigation: React.FC<TabNavigationProps> = ({ tabs, activeTab, onTabChange }) => {
  return (
    <div className="hud-tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`hud-tab ${activeTab === tab.id ? 'hud-tab-active' : ''}`}
        >
          <div className="flex items-center justify-center space-x-2">
            <span className="text-lg">{tab.icon}</span>
            <span>{tab.label}</span>
          </div>
        </button>
      ))}
    </div>
  );
};

export default TabNavigation;
