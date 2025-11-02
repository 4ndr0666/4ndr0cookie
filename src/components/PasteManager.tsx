import React, { useState, useEffect } from 'react';

/**
 * A single paste entry. Each entry contains a label (the name of the
 * credential/text), the value itself and a `hidden` flag to control
 * whether the value should be obscured in the UI.  We persist these
 * entries to chrome.storage.local under the key `pasteEntries` and
 * initialise from a small set of defaults if no saved data is found.
 */
interface PasteEntry {
  id: string;
  label: string;
  value: string;
  hidden: boolean;
}

// Initial set of entries extracted from the legacy Paste extension.  If
// there is no existing data in chrome.storage.local this array will be
// written on first load.  You can edit these values or remove them
// altogether as you see fit.
const DEFAULT_ENTRIES: PasteEntry[] = [
  { id: 'pv2', label: 'pv2', value: 'moods-slyness-44@icloud.com', hidden: true },
  { id: 'pv3', label: 'pv3 | a2e 2', value: 'nutmeg-eggcups-1m@icloud.com', hidden: true },
  { id: 'pv4', label: 'pv4', value: 'toggle.73.wand@icloud.com', hidden: true },
  { id: 'pv5', label: 'pv5', value: 'alerts_sonar_6p@icloud.com', hidden: true },
  { id: 'pverse1', label: 'pverse1 & WAN', value: 'escapes-lull-8c@icloud.com', hidden: true },
  { id: '1mwtwj', label: '1m/wt|wbj2t | a2', value: 'hinge_typical_1t@icloud.com', hidden: true },
  { id: 'clipfly', label: 'clipfly', value: 'had-award8i@icloud.com', hidden: true },
  { id: 'a2e3', label: 'a2e 3', value: 'thorns7_warmups@icloud.com', hidden: true },
  { id: '2m', label: '2m', value: 'fiesta.room.1g@icloud.com', hidden: true },
  { id: '3m', label: '3m', value: 'caldron.odious6b@icloud.com', hidden: true },
  { id: '4m', label: '4m', value: 'burrow.package3d@icloud.com', hidden: true },
  { id: '5m', label: '5m', value: 'wrapper.trance74@icloud.com', hidden: true },
];

/**
 * PasteManager provides a simple UI for creating, viewing and managing
 * short name/value pairs.  It borrows its feature set from the original
 * Paste extension: users can add arbitrary rows, edit both the name and
 * value, toggle visibility of the value, copy values to the clipboard and
 * delete rows entirely.  All state is persisted to chrome.storage.local
 * to survive browser restarts and profile reloads.
 */
const PasteManager: React.FC = () => {
  const [entries, setEntries] = useState<PasteEntry[]>([]);

  // On mount, load any saved entries from storage.  If none exist we
  // initialise with DEFAULT_ENTRIES.
  useEffect(() => {
    const loadEntries = async () => {
      try {
        const result = await chrome.storage.local.get(['pasteEntries']);
        if (result.pasteEntries && Array.isArray(result.pasteEntries) && result.pasteEntries.length > 0) {
          setEntries(result.pasteEntries as PasteEntry[]);
        } else {
          setEntries(DEFAULT_ENTRIES);
          await chrome.storage.local.set({ pasteEntries: DEFAULT_ENTRIES });
        }
      } catch (err) {
        console.error('Failed to load paste entries:', err);
        // In error conditions just fall back to default
        setEntries(DEFAULT_ENTRIES);
      }
    };
    loadEntries();
  }, []);

  // Persist the provided entries to storage and update component state.
  const saveEntries = async (newEntries: PasteEntry[]) => {
    setEntries(newEntries);
    try {
      await chrome.storage.local.set({ pasteEntries: newEntries });
    } catch (err) {
      console.error('Failed to save paste entries:', err);
    }
  };

  // Add a new empty entry.
  const addEntry = () => {
    const newEntry: PasteEntry = {
      id: Date.now().toString(),
      label: '',
      value: '',
      hidden: true,
    };
    saveEntries([...entries, newEntry]);
  };

  // Update a specific field on an entry.
  const updateEntry = (id: string, field: 'label' | 'value', value: string) => {
    const updated = entries.map((entry) =>
      entry.id === id ? { ...entry, [field]: value } : entry,
    );
    saveEntries(updated);
  };

  // Delete an entry entirely.
  const deleteEntry = (id: string) => {
    const updated = entries.filter((entry) => entry.id !== id);
    saveEntries(updated);
  };

  // Toggle the hidden state of an entry; note that we deliberately
  // do not await chrome.storage.local.set here to avoid UI jitter.
  const toggleVisibility = (id: string) => {
    const updated = entries.map((entry) =>
      entry.id === id ? { ...entry, hidden: !entry.hidden } : entry,
    );
    setEntries(updated);
    chrome.storage.local.set({ pasteEntries: updated }).catch((err) => {
      console.error('Failed to persist hidden state:', err);
    });
  };

  // Copy a value to the clipboard.  Provide simple error handling.
  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  return (
    <div className="hud-card p-3">
      <h2 className="text-lg font-semibold mb-2">Quick Paste</h2>
      <button onClick={addEntry} className="hud-btn mb-3">+ Add Row</button>
      <div className="space-y-2">
        {entries.map((entry) => (
          <div key={entry.id} className="flex items-center gap-2">
            <input
              type="text"
              className="w-32 px-2 py-1 bg-gray-700 border border-gray-600 text-gray-100 rounded focus:outline-none focus:border-cyan-400"
              value={entry.label}
              onChange={(e) => updateEntry(entry.id, 'label', e.target.value)}
              placeholder="Name"
            />
            <input
              type={entry.hidden ? 'password' : 'text'}
              className="flex-1 px-2 py-1 bg-gray-700 border border-gray-600 text-gray-100 rounded focus:outline-none focus:border-cyan-400"
              value={entry.value}
              onChange={(e) => updateEntry(entry.id, 'value', e.target.value)}
              placeholder="Value"
            />
            <button onClick={() => toggleVisibility(entry.id)} className="hud-btn px-2">
              {entry.hidden ? 'Show' : 'Hide'}
            </button>
            <button onClick={() => copyToClipboard(entry.value)} className="hud-btn px-2">
              Copy
            </button>
            <button onClick={() => deleteEntry(entry.id)} className="hud-btn px-2">
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PasteManager;