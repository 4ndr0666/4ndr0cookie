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

const DEFAULT_EMAIL_GROUPS: EmailGroup[] = [];

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
      const groups = (result.emailGroups as EmailGroup[]) || [];
      if (groups.length > 0) {
        setEmailGroups(groups);
        if (!activeGroup) {
          setActiveGroup(groups[0].id);
        }
      } else {
        setEmailGroups(DEFAULT_EMAIL_GROUPS);
        await chrome.storage.local.set({ emailGroups: DEFAULT_EMAIL_GROUPS });
      }
    } catch (error) {
      console.error('Error loading email groups:', error);
      // Fallback to default in case of error
      setEmailGroups(DEFAULT_EMAIL_GROUPS);
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
    <div className="hud-card">
      {/* Header */}
      <div className="border-b border-cyan-300/20 px-4 sm:px-6 py-3 sm:py-4">
        <h2 className="hud-title">Email List Manager</h2>
        <p className="text-sm text-gray-400">One-click dropdown with editable email entries</p>
      </div>

      <div className="p-4 space-y-4">
        {/* One-Click Dropdown */}
        <div className="relative">
          <select
            value={activeGroup}
            onChange={(e) => setActiveGroup(e.target.value)}
            className="hud-input appearance-none pr-10"
          >
            <option value="">📧 Select Email Group...</option>
            {emailGroups.map(group => (
              <option key={group.id} value={group.id}>{group.name}</option>
            ))}
          </select>

          <button
            onClick={() => setShowNewGroup(true)}
            className="hud-btn absolute right-2 top-1/2 -translate-y-1/2"
          >
            + New
          </button>
        </div>

        {/* New Group Creation */}
        {showNewGroup && (
          <div className="hud-section flex items-center space-x-2">
            <input
              type="text"
              placeholder="Group name..."
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              className="hud-input flex-1"
              onKeyPress={(e) => e.key === 'Enter' && createNewGroup()}
            />
            <button
              onClick={createNewGroup}
              className="hud-btn"
            >
              Create
            </button>
            <button
              onClick={() => {
                setShowNewGroup(false);
                setNewGroupName('');
              }}
              className="hud-btn hud-btn-danger"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Email Entries with Copy Buttons */}
        {activeGroup && (
          <div className="space-y-3">
            {/* Quick Actions */}
            <div className="hud-section flex items-center justify-between">
              <h3 className="hud-title">
                {emailGroups.find(g => g.id === activeGroup)?.name}
              </h3>
              <div className="flex space-x-2">
                <button
                  onClick={addEmailEntry}
                  className="hud-btn"
                >
                  + Add Entry
                </button>
                <button
                  onClick={exportGroupAsText}
                  className="hud-btn"
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
                  className="hud-btn"
                >
                  Copy All Labels
                </button>
              </div>
            </div>

            {/* Editable Email Rows */}
            {currentEntries.map((entry) => (
              <div key={entry.id} className="hud-section flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  placeholder="Label (m1, m2...)"
                  value={entry.label}
                  onChange={(e) => updateEmailEntry(entry.id, 'label', e.target.value)}
                  className="hud-input flex-shrink-0"
                />
                <input
                  type="email"
                  placeholder="email@example.com"
                  value={entry.email}
                  onChange={(e) => updateEmailEntry(entry.id, 'email', e.target.value)}
                  className="hud-input flex-1 min-w-0"
                />
                <div className="flex flex-shrink-0 gap-2">
                  <button
                    onClick={() => copyToClipboard(entry.email)}
                    className="hud-btn"
                    disabled={!entry.email}
                  >
                    📋 Copy
                  </button>
                  <button
                    onClick={() => deleteEmailEntry(entry.id)}
                    className="hud-btn hud-btn-danger"
                  >
                    🗑️ Delete
                  </button>
                </div>
              </div>
            ))}

            {/* Import from Text */}
            <div className="hud-section">
              <h4 className="text-sm font-medium text-gray-300 mb-2">Import from Text</h4>
              <textarea
                placeholder="Paste email list here (format: label: email@example.com)"
                className="hud-input"
                rows={3}
                onPaste={(e) => {
                  setTimeout(() => {
                    const text = e.currentTarget.value;
                    if (text.trim()) {
                      importFromText(text);
                      e.currentTarget.value = '';
                    }
                  }, 100);
                }}
              />
              <p className="text-xs text-gray-500 mt-1">
                Format: "m1: user@domain.com" (one per line)
              </p>
            </div>

            {/* Delete Group */}
            <div className="flex justify-end">
              <button
                onClick={() => deleteGroup(activeGroup)}
                className="hud-btn hud-btn-danger"
              >
                🗑️ Delete Group
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmailListManager;
