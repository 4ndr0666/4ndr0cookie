import React, { useState, useEffect } from 'react';

interface EmailEntry {
  id: string;
  label: string;
  email: string;
  timestamp: number;
}

interface EmailGroup {
  id: string;
  name: string;
  entries: EmailEntry[];
}

const EmailListManager: React.FC = () => {
  const [emailGroups, setEmailGroups] = useState<EmailGroup[]>([]);
  const [activeGroup, setActiveGroup] = useState<string>('');
  const [newGroupName, setNewGroupName] = useState('');
  const [showNewGroup, setShowNewGroup] = useState(false);

  useEffect(() => {
    loadEmailGroups();
  }, []);

  const loadEmailGroups = async () => {
    try {
      const result = await chrome.storage.local.get(['emailGroups']);
      if (result.emailGroups) {
        setEmailGroups(result.emailGroups);
        if (result.emailGroups.length > 0 && !activeGroup) {
          setActiveGroup(result.emailGroups[0].id);
        }
      }
    } catch (error) {
      console.error('Error loading email groups:', error);
    }
  };

  const saveEmailGroups = async (groups: EmailGroup[]) => {
    try {
      await chrome.storage.local.set({ emailGroups: groups });
      setEmailGroups(groups);
    } catch (error) {
      console.error('Error saving email groups:', error);
    }
  };

  const createNewGroup = () => {
    if (!newGroupName.trim()) return;
    
    const newGroup: EmailGroup = {
      id: Date.now().toString(),
      name: newGroupName.trim(),
      entries: []
    };
    
    const updatedGroups = [...emailGroups, newGroup];
    saveEmailGroups(updatedGroups);
    setActiveGroup(newGroup.id);
    setNewGroupName('');
    setShowNewGroup(false);
  };

  const deleteGroup = (groupId: string) => {
    const updatedGroups = emailGroups.filter(g => g.id !== groupId);
    saveEmailGroups(updatedGroups);
    if (activeGroup === groupId) {
      setActiveGroup(updatedGroups.length > 0 ? updatedGroups[0].id : '');
    }
  };

  const addEmailEntry = () => {
    if (!activeGroup) return;
    
    const newEntry: EmailEntry = {
      id: Date.now().toString(),
      label: '',
      email: '',
      timestamp: Date.now()
    };
    
    const updatedGroups = emailGroups.map(group => 
      group.id === activeGroup 
        ? { ...group, entries: [...group.entries, newEntry] }
        : group
    );
    
    saveEmailGroups(updatedGroups);
  };

  const updateEmailEntry = (entryId: string, field: 'label' | 'email', value: string) => {
    const updatedGroups = emailGroups.map(group => 
      group.id === activeGroup 
        ? {
            ...group, 
            entries: group.entries.map(entry => 
              entry.id === entryId ? { ...entry, [field]: value } : entry
            )
          }
        : group
    );
    
    saveEmailGroups(updatedGroups);
  };

  const deleteEmailEntry = (entryId: string) => {
    const updatedGroups = emailGroups.map(group => 
      group.id === activeGroup 
        ? { ...group, entries: group.entries.filter(e => e.id !== entryId) }
        : group
    );
    
    saveEmailGroups(updatedGroups);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error('Error copying to clipboard:', error);
    }
  };

  const exportGroupAsText = () => {
    const group = emailGroups.find(g => g.id === activeGroup);
    if (!group) return;
    
    const textContent = group.entries
      .filter(entry => entry.label && entry.email)
      .map(entry => `${entry.label}: ${entry.email}`)
      .join('\n');
    
    copyToClipboard(textContent);
  };

  const importFromText = (text: string) => {
    const lines = text.split('\n').filter(line => line.trim());
    const newEntries: EmailEntry[] = [];
    
    lines.forEach(line => {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const label = line.substring(0, colonIndex).trim();
        const email = line.substring(colonIndex + 1).trim();
        if (label && email) {
          newEntries.push({
            id: Date.now().toString() + Math.random(),
            label,
            email,
            timestamp: Date.now()
          });
        }
      }
    });
    
    if (newEntries.length > 0) {
      const updatedGroups = emailGroups.map(group => 
        group.id === activeGroup 
          ? { ...group, entries: [...group.entries, ...newEntries] }
          : group
      );
      saveEmailGroups(updatedGroups);
    }
  };

  const currentGroup = emailGroups.find(g => g.id === activeGroup);
  const currentEntries = currentGroup?.entries || [];

  return (
    <div className="min-h-full bg-gray-900 text-gray-100">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 p-4">
        <h2 className="text-lg font-semibold" style={{color: '#15FFFF'}}>Email List Manager</h2>
        <p className="text-sm text-gray-400">One-click dropdown with editable email entries</p>
      </div>

      <div className="p-4 space-y-4">
        {/* One-Click Dropdown */}
        <div className="relative">
          <select
            value={activeGroup}
            onChange={(e) => setActiveGroup(e.target.value)}
            className="w-full px-4 py-3 bg-gray-800 border-2 border-gray-600 text-gray-100 rounded-lg focus:outline-none focus:border-cyan-400 text-lg font-medium"
            style={{borderColor: activeGroup ? '#15FFFF' : undefined, color: activeGroup ? '#15FFFF' : undefined}}
          >
            <option value="">📧 Select Email Group...</option>
            {emailGroups.map(group => (
              <option key={group.id} value={group.id}>{group.name}</option>
            ))}
          </select>
          
          <button
            onClick={() => setShowNewGroup(true)}
            className="absolute right-2 top-2 px-3 py-2 text-sm rounded-md transition-colors"
            style={{backgroundColor: '#15FFFF', color: '#111827'}}
          >
            + New
          </button>
        </div>

        {/* New Group Creation */}
        {showNewGroup && (
          <div className="flex items-center space-x-2 p-4 bg-gray-800 rounded-lg border-2" style={{borderColor: '#15FFFF'}}>
            <input
              type="text"
              placeholder="Group name..."
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 text-gray-100 rounded focus:outline-none focus:border-cyan-400"
              onKeyPress={(e) => e.key === 'Enter' && createNewGroup()}
            />
            <button
              onClick={createNewGroup}
              className="px-4 py-2 rounded font-medium transition-colors"
              style={{backgroundColor: '#15FFFF', color: '#111827'}}
            >
              Create
            </button>
            <button
              onClick={() => {
                setShowNewGroup(false);
                setNewGroupName('');
              }}
              className="px-4 py-2 bg-gray-600 text-gray-300 rounded hover:bg-gray-500 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Email Entries with Copy Buttons */}
        {activeGroup && (
          <div className="space-y-3">
            {/* Quick Actions */}
            <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg border border-gray-700">
              <h3 className="text-lg font-medium" style={{color: '#15FFFF'}}>
                {emailGroups.find(g => g.id === activeGroup)?.name}
              </h3>
              <div className="flex space-x-2">
                <button
                  onClick={addEmailEntry}
                  className="px-3 py-1 text-sm rounded font-medium transition-colors"
                  style={{backgroundColor: '#15FFFF', color: '#111827'}}
                >
                  + Add Entry
                </button>
                <button
                  onClick={exportGroupAsText}
                  className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-500 transition-colors font-medium"
                >
                  Copy All Emails
                </button>
                <button
                  onClick={() => {
                    const labels = currentEntries
                      .filter(e => e.label)
                      .map(e => e.label)
                      .join(', ');
                    copyToClipboard(labels);
                  }}
                  className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-500 transition-colors font-medium"
                >
                  Copy All Labels
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmailListManager;
