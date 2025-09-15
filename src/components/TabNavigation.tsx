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
    <div className="flex border-b border-gray-700 bg-gray-800">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors duration-200 ${
            activeTab === tab.id
              ? 'bg-cyan-400 text-gray-900 border-b-2 border-cyan-400'
              : 'text-gray-300 hover:text-cyan-400 hover:bg-gray-700'
          }`}
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
