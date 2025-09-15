import React, { useState, useEffect } from 'react';

interface ClipboardItem {
  id: string;
  content: string;
  timestamp: number;
  type: 'text' | 'url' | 'email';
}

const ClipboardManager: React.FC = () => {
  const [clipboardHistory, setClipboardHistory] = useState<ClipboardItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadClipboardHistory();
  }, []);

  const loadClipboardHistory = async () => {
    try {
      const result = await chrome.storage.local.get(['clipboardHistory']);
      if (result.clipboardHistory) {
        setClipboardHistory(result.clipboardHistory);
      }
    } catch (error) {
      console.error('Error loading clipboard history:', error);
    }
  };

  const saveToClipboard = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      
      // Update the item's timestamp to move it to the top
      const updatedHistory = clipboardHistory.map(item => 
        item.content === content 
          ? { ...item, timestamp: Date.now() }
          : item
      ).sort((a, b) => b.timestamp - a.timestamp);
      
      setClipboardHistory(updatedHistory);
      await chrome.storage.local.set({ clipboardHistory: updatedHistory });
    } catch (error) {
      console.error('Error copying to clipboard:', error);
    }
  };

  const deleteItem = async (id: string) => {
    const updatedHistory = clipboardHistory.filter(item => item.id !== id);
    setClipboardHistory(updatedHistory);
    await chrome.storage.local.set({ clipboardHistory: updatedHistory });
  };

  const clearHistory = async () => {
    setClipboardHistory([]);
    await chrome.storage.local.set({ clipboardHistory: [] });
  };

  const getItemType = (content: string): 'text' | 'url' | 'email' => {
    if (content.match(/^https?:\/\//)) return 'url';
    if (content.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) return 'email';
    return 'text';
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'url': return '🔗';
      case 'email': return '📧';
      default: return '📝';
    }
  };

  const filteredHistory = clipboardHistory.filter(item =>
    item.content.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-4">
      <div className="mb-4">
        <div className="flex space-x-2 mb-3">
          <input
            type="text"
            placeholder="Search clipboard history..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={clearHistory}
            className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
          >
            Clear All
          </button>
        </div>
      </div>

      <div className="space-y-2 max-h-80 overflow-y-auto">
        {filteredHistory.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            No clipboard history found
          </div>
        ) : (
          filteredHistory.map((item) => (
            <div key={item.id} className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <span>{getTypeIcon(item.type)}</span>
                    <span className="text-xs text-gray-500">
                      {new Date(item.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-sm text-gray-900 break-all">
                    {item.content.length > 100 
                      ? `${item.content.substring(0, 100)}...`
                      : item.content
                    }
                  </div>
                </div>
                <div className="flex space-x-1 ml-2">
                  <button
                    onClick={() => saveToClipboard(item.content)}
                    className="px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors"
                  >
                    Copy
                  </button>
                  <button
                    onClick={() => deleteItem(item.id)}
                    className="px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ClipboardManager;
