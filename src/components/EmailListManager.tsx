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
    <div className="hud-scroll space-y-4">
      <section className="hud-section">
        <div className="hud-section-header">
          <div>
            <h2 className="hud-section-title">Email list manager</h2>
            <p className="hud-section-subtitle">One-click dropdown with editable email entries</p>
          </div>
          <span className="hud-chip">
            <span className="hud-chip__dot" />
            {emailGroups.length > 0 ? `${emailGroups.length} groups` : 'No groups yet'}
          </span>
        </div>

        <div className="hud-field-vertical">
          <span className="hud-label">Active group</span>
          <div className="hud-input-stack">
            <div className={`hud-select-wrapper${activeGroup ? '' : ' hud-select-wrapper--empty'}`}>
              <select
                id="email-group-select"
                value={activeGroup}
                onChange={(e) => setActiveGroup(e.target.value)}
                className="hud-select"
              >
                <option value="">📧 Select email group…</option>
                {emailGroups.map(group => (
                  <option key={group.id} value={group.id}>{group.name}</option>
                ))}
              </select>
            </div>
            <div className="hud-action-tray">
              <button
                type="button"
                onClick={() => setShowNewGroup(true)}
                className="hud-btn"
                data-variant="accent"
                data-size="sm"
              >
                + New
              </button>
            </div>
          </div>
        </div>
      </section>

      {showNewGroup && (
        <section className="hud-section hud-section--inline">
          <div className="hud-field-vertical">
            <span className="hud-label">Create group</span>
            <div className="hud-input-stack">
              <input
                type="text"
                placeholder="Group name…"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                className="hud-input"
                onKeyDown={(e) => e.key === 'Enter' && createNewGroup()}
              />
              <div className="hud-toolbar hud-action-tray">
                <button
                  type="button"
                  onClick={createNewGroup}
                  className="hud-btn"
                  data-variant="accent"
                  data-size="sm"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewGroup(false);
                    setNewGroupName('');
                  }}
                  className="hud-btn"
                  data-variant="ghost"
                  data-size="sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {activeGroup && (
        <>
          <section className="hud-section">
            <div className="hud-section-header">
              <div>
                <h3 className="hud-section-title">{emailGroups.find(g => g.id === activeGroup)?.name || 'Selected group'}</h3>
                <p className="hud-section-subtitle">Manage addresses, copy blocks, and import text lists</p>
              </div>
              <span className="hud-chip">
                <span className="hud-chip__dot" />
                {currentEntries.length} entr{currentEntries.length === 1 ? 'y' : 'ies'}
              </span>
            </div>

            <div className="hud-toolbar">
              <button
                type="button"
                onClick={addEmailEntry}
                className="hud-btn"
                data-variant="accent"
                data-size="sm"
              >
                + Add entry
              </button>
              <button
                type="button"
                onClick={exportGroupAsText}
                className="hud-btn"
                data-variant="ghost"
                data-size="sm"
              >
                📋 Copy emails
              </button>
              <button
                type="button"
                onClick={() => {
                  const labels = currentEntries
                    .filter(e => e.label)
                    .map(e => e.label)
                    .join(', ');
                  copyToClipboard(labels);
                }}
                className="hud-btn"
                data-variant="ghost"
                data-size="sm"
              >
                🏷️ Copy labels
              </button>
            </div>

            <div className="hud-stack">
              {currentEntries.length === 0 ? (
                <div className="hud-empty">
                  <p>No saved addresses yet. Add an entry or import from text.</p>
                </div>
              ) : (
                currentEntries.map((entry) => (
                  <div key={entry.id} className="hud-item">
                    <div className="hud-item__col hud-item__col--compact">
                      <span className="hud-label" data-variant="muted">Label</span>
                      <input
                        type="text"
                        placeholder="Label (m1, m2…)"
                        value={entry.label}
                        onChange={(e) => updateEmailEntry(entry.id, 'label', e.target.value)}
                        className="hud-input hud-input--compact"
                      />
                    </div>
                    <div className="hud-item__col">
                      <span className="hud-label" data-variant="muted">Email</span>
                      <input
                        type="email"
                        placeholder="email@example.com"
                        value={entry.email}
                        onChange={(e) => updateEmailEntry(entry.id, 'email', e.target.value)}
                        className="hud-input"
                      />
                    </div>
                    <div className="hud-item__actions">
                      <button
                        type="button"
                        onClick={() => copyToClipboard(entry.email)}
                        className="hud-btn"
                        data-variant="ghost"
                        data-size="xs"
                        disabled={!entry.email}
                      >
                        📋 Copy
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteEmailEntry(entry.id)}
                        className="hud-btn"
                        data-variant="danger"
                        data-size="xs"
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="hud-subsection">
              <h4 className="hud-section-subtitle">Import from text</h4>
              <textarea
                placeholder="Paste email list here (format: label: email@example.com)"
                className="hud-textarea"
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
              <p className="hud-subtext">Format: “m1: user@domain.com” (one per line)</p>
            </div>

            <div className="hud-toolbar hud-toolbar--right">
              <button
                type="button"
                onClick={() => deleteGroup(activeGroup)}
                className="hud-btn"
                data-variant="danger"
                data-size="sm"
              >
                🗑️ Delete group
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default EmailListManager;
