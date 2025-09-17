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
          type="button"
          onClick={() => onTabChange(tab.id)}
          className={`hud-tab ${activeTab === tab.id ? 'hud-tab-active' : ''}`}
        >
          <span className="hud-tab__icon" aria-hidden="true">{tab.icon}</span>
          <span className="hud-tab__label">{tab.label}</span>
        </button>
      ))}
    </div>
  );
};

export default TabNavigation;
