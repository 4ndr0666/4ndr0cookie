/**
 * CredentialVault.tsx  (replaces PasteManager)
 *
 * Grouped credential store. One group = one website.
 * Each site has a note field (2FA, credits, trial details) and
 * an array of accounts, each with email, password, show/hide toggle,
 * and a Fresh → Active → Exhausted status badge.
 *
 * Quick-copy: single click on email copies it; double-click copies password.
 * Popover: clicking a site name in the left panel shows all accounts for
 * one-click email / double-click password copy.
 *
 * Export: AES-256-GCM encrypted .vault file (Web Crypto API).
 * Import: decrypt .vault file and merge into existing groups.
 *
 * Storage: chrome.storage.local under key "credentialVault".
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';

/* ─── Types ─── */

type AccountStatus = 'fresh' | 'active' | 'exhausted';

interface Account {
  id: string;
  email: string;
  password: string;
  hidden: boolean;
  status: AccountStatus;
}

interface SiteGroup {
  id: string;
  site: string;
  note: string;
  accounts: Account[];
}

const STATUS_CYCLE: AccountStatus[] = ['fresh', 'active', 'exhausted'];
const STATUS_LABEL: Record<AccountStatus, string> = {
  fresh: 'Fresh',
  active: 'Active',
  exhausted: 'Exhausted',
};

/* ─── Default data (migrated from legacy PasteManager DEFAULT_ENTRIES) ─── */
const DEFAULT_GROUPS: SiteGroup[] = [
  {
    id: 'wan',
    site: 'wan',
    note: '',
    accounts: [{ id: 'wan-0', email: 'escapes-lull-8c@icloud.com', password: '', hidden: true, status: 'fresh' }],
  },
  {
    id: '1mwtwbj2t',
    site: '1m | wt|wbj2t',
    note: '',
    accounts: [{ id: '1mwtwbj2t-0', email: 'hinge_typical_1t@icloud.com', password: '', hidden: true, status: 'fresh' }],
  },
  {
    id: 'clipfly',
    site: 'clipfly',
    note: '',
    accounts: [{ id: 'clipfly-0', email: 'had-award8i@icloud.com', password: '', hidden: true, status: 'fresh' }],
  },
  {
    id: '3m',
    site: '3m',
    note: '',
    accounts: [{ id: '3m-0', email: 'encoder.51-test@icloud.com', password: '', hidden: true, status: 'fresh' }],
  },
  {
    id: '4m',
    site: '4m',
    note: '',
    accounts: [{ id: '4m-0', email: 'verve.27-gears@icloud.com', password: '', hidden: true, status: 'fresh' }],
  },
  {
    id: '2m',
    site: '2m',
    note: '',
    accounts: [{ id: '2m-0', email: 'orotund_swan_3o@icloud.com', password: '', hidden: true, status: 'fresh' }],
  },
  {
    id: '00',
    site: '00',
    note: '',
    accounts: [{ id: '00-0', email: 'whoops.motor.36@icloud.com', password: '', hidden: true, status: 'fresh' }],
  },
];

/* ─── AES-256-GCM helpers (Web Crypto API — no crypto-js) ─── */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: 310_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptVault(data: SiteGroup[], password: string): Promise<Blob> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const plain = new TextEncoder().encode(JSON.stringify(data));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, plain);

  // Format: 4-byte magic | 32-byte salt | 12-byte iv | ciphertext
  const magic = new Uint8Array([0x34, 0x6e, 0x74, 0x76]); // "4ntv"
  const out = new Uint8Array(4 + 32 + 12 + cipher.byteLength);
  out.set(magic, 0);
  out.set(salt, 4);
  out.set(iv, 36);
  out.set(new Uint8Array(cipher), 48);
  return new Blob([out], { type: 'application/octet-stream' });
}

async function decryptVault(buffer: ArrayBuffer, password: string): Promise<SiteGroup[]> {
  const data = new Uint8Array(buffer);
  const magic = String.fromCharCode(...data.slice(0, 4));
  if (magic !== '4ntv') throw new Error('Invalid vault file');
  const salt = data.slice(4, 36);
  const iv = data.slice(36, 48);
  const cipher = data.slice(48);
  const key = await deriveKey(password, salt);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, cipher as BufferSource);
  return JSON.parse(new TextDecoder().decode(plain)) as SiteGroup[];
}

/* ─── Component ─── */

const CredentialVault: React.FC = () => {
  const [groups, setGroups] = useState<SiteGroup[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [popoverSiteId, setPopoverSiteId] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string>('');
  const [vaultPassword, setVaultPassword] = useState('');
  const [showPwPrompt, setShowPwPrompt] = useState<'export' | 'import' | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const clickTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  /* load */
  useEffect(() => {
    chrome.storage.local.get(['credentialVault']).then((r) => {
      const vault = r.credentialVault;
      if (vault && Array.isArray(vault) && vault.length > 0) {
        setGroups(vault as SiteGroup[]);
        setSelectedId(vault[0].id);
      } else {
        setGroups(DEFAULT_GROUPS);
        setSelectedId(DEFAULT_GROUPS[0].id);
        chrome.storage.local.set({ credentialVault: DEFAULT_GROUPS });
      }
    });
  }, []);

  const persist = useCallback((next: SiteGroup[]) => {
    setGroups(next);
    chrome.storage.local.set({ credentialVault: next }).catch(console.error);
  }, []);

  const selectedGroup = groups.find((g) => g.id === selectedId) ?? null;

  /* ── copy helpers ── */
  const flash = (msg: string) => {
    setCopyFeedback(msg);
    setTimeout(() => setCopyFeedback(''), 1500);
  };

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flash(`✓ ${label} copied`);
    } catch { flash('✗ copy failed'); }
  };

  /* Single click → email; double click → password */
  const handleAccountClick = (acc: Account) => {
    const id = acc.id;
    if (clickTimers.current[id]) {
      // double-click
      clearTimeout(clickTimers.current[id]);
      delete clickTimers.current[id];
      copyText(acc.password, 'Password');
    } else {
      clickTimers.current[id] = setTimeout(() => {
        delete clickTimers.current[id];
        copyText(acc.email, 'Email');
      }, 250);
    }
  };

  /* ── group mutations ── */
  const addGroup = () => {
    const ng: SiteGroup = { id: Date.now().toString(), site: '', note: '', accounts: [] };
    const next = [...groups, ng];
    persist(next);
    setSelectedId(ng.id);
  };

  const deleteGroup = (id: string) => {
    const next = groups.filter((g) => g.id !== id);
    persist(next);
    setSelectedId(next[0]?.id ?? null);
  };

  const updateGroup = (id: string, field: 'site' | 'note', value: string) => {
    persist(groups.map((g) => g.id === id ? { ...g, [field]: value } : g));
  };

  /* ── account mutations ── */
  const addAccount = (groupId: string) => {
    const na: Account = { id: Date.now().toString(), email: '', password: '', hidden: true, status: 'fresh' };
    persist(groups.map((g) => g.id === groupId ? { ...g, accounts: [...g.accounts, na] } : g));
  };

  const deleteAccount = (groupId: string, accId: string) => {
    persist(groups.map((g) =>
      g.id === groupId ? { ...g, accounts: g.accounts.filter((a) => a.id !== accId) } : g,
    ));
  };

  const updateAccount = (groupId: string, accId: string, field: 'email' | 'password', value: string) => {
    persist(groups.map((g) =>
      g.id === groupId
        ? { ...g, accounts: g.accounts.map((a) => a.id === accId ? { ...a, [field]: value } : a) }
        : g,
    ));
  };

  const toggleHidden = (groupId: string, accId: string) => {
    persist(groups.map((g) =>
      g.id === groupId
        ? { ...g, accounts: g.accounts.map((a) => a.id === accId ? { ...a, hidden: !a.hidden } : a) }
        : g,
    ));
  };

  const cycleStatus = (groupId: string, accId: string) => {
    persist(groups.map((g) =>
      g.id === groupId
        ? {
            ...g,
            accounts: g.accounts.map((a) => {
              if (a.id !== accId) return a;
              const idx = STATUS_CYCLE.indexOf(a.status);
              return { ...a, status: STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length] };
            }),
          }
        : g,
    ));
  };

  /* ── export/import ── */
  const handleExport = async () => {
    if (!vaultPassword) return;
    try {
      const blob = await encryptVault(groups, vaultPassword);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `4ndr0cookie-vault-${Date.now()}.vault`;
      a.click();
      URL.revokeObjectURL(url);
      setShowPwPrompt(null);
      setVaultPassword('');
      flash('✓ Vault exported');
    } catch (e) {
      flash('✗ Export failed');
      console.error(e);
    }
  };

  const handleImport = async () => {
    if (!vaultPassword || !importFile) return;
    try {
      const buf = await importFile.arrayBuffer();
      const imported = await decryptVault(buf, vaultPassword);
      // Merge: new groups added, existing groups updated by site name
      const merged = [...groups];
      for (const ng of imported) {
        const existing = merged.find((g) => g.site === ng.site);
        if (existing) {
          // append accounts not already present
          const newAccs = ng.accounts.filter(
            (na) => !existing.accounts.some((ea) => ea.email === na.email),
          );
          existing.accounts.push(...newAccs);
        } else {
          merged.push(ng);
        }
      }
      persist(merged);
      setShowPwPrompt(null);
      setVaultPassword('');
      setImportFile(null);
      flash(`✓ Imported ${imported.length} groups`);
    } catch (e) {
      flash('✗ Decryption failed — wrong password?');
      console.error(e);
    }
  };

  /* ─── Render ─── */
  return (
    <div className="hud-card flex flex-col" style={{ minHeight: 420 }}>
      {/* Header */}
      <div className="border-b px-4 py-3 flex items-center justify-between"
        style={{ borderColor: 'var(--accent-cyan-border-idle)' }}>
        <div>
          <h2 className="hud-title" style={{ marginBottom: 0 }}>Credential Vault</h2>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Click email to copy · double-click to copy password
          </p>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => { setShowPwPrompt('export'); }}
            className="hud-btn"
            style={{ fontSize: '0.65rem', padding: '0.2rem 0.5rem' }}
            aria-label="Export encrypted vault"
          >
            ↑ Export
          </button>
          <button
            onClick={() => importRef.current?.click()}
            className="hud-btn"
            style={{ fontSize: '0.65rem', padding: '0.2rem 0.5rem' }}
            aria-label="Import encrypted vault"
          >
            ↓ Import
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".vault"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) { setImportFile(f); setShowPwPrompt('import'); }
            }}
          />
        </div>
      </div>

      {/* Copy feedback toast */}
      {copyFeedback && (
        <div
          className="text-xs text-center py-1"
          style={{ color: 'var(--accent-cyan)', background: 'rgba(0,229,255,0.08)' }}
        >
          {copyFeedback}
        </div>
      )}

      {/* Password prompt overlay */}
      {showPwPrompt && (
        <div
          className="p-4 space-y-3"
          style={{ background: 'rgba(5,10,15,0.9)', border: '1px solid var(--accent-cyan-border-hover)', borderRadius: 6 }}
        >
          <p className="text-xs" style={{ color: 'var(--text-cyan-active)' }}>
            {showPwPrompt === 'export'
              ? 'Set a password to encrypt your vault export:'
              : `Decryption password for "${importFile?.name}":`}
          </p>
          <input
            type="password"
            className="hud-input"
            value={vaultPassword}
            onChange={(e) => setVaultPassword(e.target.value)}
            placeholder="Vault password…"
            onKeyDown={(e) => {
              if (e.key === 'Enter') showPwPrompt === 'export' ? handleExport() : handleImport();
            }}
            aria-label="Vault password"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={showPwPrompt === 'export' ? handleExport : handleImport}
              disabled={!vaultPassword}
              className="hud-btn flex-1"
              style={{ fontSize: '0.75rem' }}
            >
              {showPwPrompt === 'export' ? '↑ Encrypt & Export' : '↓ Decrypt & Import'}
            </button>
            <button
              onClick={() => { setShowPwPrompt(null); setVaultPassword(''); }}
              className="hud-btn"
              style={{ fontSize: '0.75rem' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Main body — left panel + right panel */}
      {!showPwPrompt && (
        <div className="flex flex-1 overflow-hidden" style={{ minHeight: 320 }}>

          {/* Left — site list */}
          <div
            className="flex flex-col"
            style={{
              width: 140,
              borderRight: '1px solid var(--accent-cyan-border-idle)',
              overflowY: 'auto',
            }}
          >
            <div className="p-2">
              <button
                onClick={addGroup}
                className="hud-btn w-full"
                style={{ fontSize: '0.65rem', padding: '0.2rem 0.4rem' }}
                aria-label="Add new site group"
              >
                + Add Site
              </button>
            </div>
            {groups.map((g) => (
              <div
                key={g.id}
                className="relative group"
                style={{
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                }}
              >
                <button
                  onClick={() => { setSelectedId(g.id); setPopoverSiteId(null); }}
                  onDoubleClick={() => setPopoverSiteId(popoverSiteId === g.id ? null : g.id)}
                  title="Click to select · double-click for quick-copy popover"
                  className="w-full text-left px-3 py-2 text-xs truncate transition-colors"
                  style={{
                    color: selectedId === g.id ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                    background: selectedId === g.id ? 'var(--accent-cyan-bg-active)' : 'transparent',
                    borderLeft: selectedId === g.id ? '2px solid var(--accent-cyan)' : '2px solid transparent',
                  }}
                  aria-label={`Select site ${g.site || 'unnamed'}`}
                >
                  {g.site || <em style={{ opacity: 0.5 }}>unnamed</em>}
                </button>

                {/* Quick-copy popover */}
                {popoverSiteId === g.id && g.accounts.length > 0 && (
                  <div
                    className="absolute left-full top-0 z-50 p-2 space-y-1"
                    style={{
                      background: 'rgba(10,19,26,0.97)',
                      border: '1px solid var(--accent-cyan-border-hover)',
                      backdropFilter: 'blur(12px)',
                      borderRadius: 6,
                      minWidth: 220,
                      boxShadow: 'var(--shadow-glass-glow)',
                    }}
                  >
                    <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
                      Click email · double-click password
                    </p>
                    {g.accounts.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center gap-1 p-1 rounded cursor-pointer transition-colors"
                        style={{ background: 'rgba(0,229,255,0.04)' }}
                        onClick={() => handleAccountClick(a)}
                        title="Click = email · double-click = password"
                        role="button"
                        aria-label={`Copy credentials for ${a.email}`}
                      >
                        <span
                          className="text-xs flex-1 truncate"
                          style={{ color: 'var(--text-cyan-active)' }}
                        >
                          {a.email || <em style={{ opacity: 0.5 }}>no email</em>}
                        </span>
                        <span
                          className={`text-xs px-1 rounded ${a.status}`}
                          style={{ fontSize: '0.6rem' }}
                        >
                          {STATUS_LABEL[a.status][0]}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Right — selected group detail */}
          <div className="flex-1 flex flex-col overflow-y-auto p-3 space-y-3">
            {!selectedGroup ? (
              <p className="text-xs text-center pt-8" style={{ color: 'var(--text-secondary)' }}>
                Select or add a site →
              </p>
            ) : (
              <>
                {/* Site name + note + delete group */}
                <div className="hud-section space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      className="hud-input flex-1"
                      value={selectedGroup.site}
                      onChange={(e) => updateGroup(selectedGroup.id, 'site', e.target.value)}
                      placeholder="Site name…"
                      aria-label="Site name"
                    />
                    <button
                      onClick={() => deleteGroup(selectedGroup.id)}
                      className="hud-btn hud-btn-danger"
                      style={{ fontSize: '0.65rem', padding: '0.2rem 0.5rem', flexShrink: 0 }}
                      aria-label="Delete this site group"
                    >
                      ✕
                    </button>
                  </div>
                  <input
                    className="hud-input"
                    value={selectedGroup.note}
                    onChange={(e) => updateGroup(selectedGroup.id, 'note', e.target.value)}
                    placeholder="Notes — 2FA, credits, trial details…"
                    aria-label="Site notes"
                  />
                </div>

                {/* Account rows */}
                <div className="space-y-2">
                  {selectedGroup.accounts.map((acc) => (
                    <div key={acc.id} className="hud-section space-y-1">
                      {/* Email row */}
                      <div className="flex items-center gap-2">
                        <input
                          className="hud-input flex-1"
                          value={acc.email}
                          onChange={(e) => updateAccount(selectedGroup.id, acc.id, 'email', e.target.value)}
                          placeholder="Email…"
                          aria-label="Account email"
                        />
                        {/* Status badge — click to cycle */}
                        <button
                          onClick={() => cycleStatus(selectedGroup.id, acc.id)}
                          className={`text-xs px-2 py-1 rounded cursor-pointer transition-all status-${acc.status}`}
                          style={{ flexShrink: 0, fontFamily: 'var(--font-body)', fontSize: '0.65rem' }}
                          aria-label={`Status: ${STATUS_LABEL[acc.status]} — click to cycle`}
                          title="Click to cycle status"
                        >
                          {STATUS_LABEL[acc.status]}
                        </button>
                      </div>

                      {/* Password row */}
                      <div className="flex items-center gap-2">
                        <input
                          type={acc.hidden ? 'password' : 'text'}
                          className="hud-input flex-1"
                          value={acc.password}
                          onChange={(e) => updateAccount(selectedGroup.id, acc.id, 'password', e.target.value)}
                          placeholder="Password…"
                          aria-label="Account password"
                        />
                        <button
                          onClick={() => toggleHidden(selectedGroup.id, acc.id)}
                          className="hud-btn"
                          style={{ fontSize: '0.65rem', padding: '0.2rem 0.5rem', flexShrink: 0 }}
                          aria-label={acc.hidden ? 'Show password' : 'Hide password'}
                        >
                          {acc.hidden ? '👁' : '🙈'}
                        </button>
                        <button
                          onClick={() => handleAccountClick(acc)}
                          className="hud-btn"
                          style={{ fontSize: '0.65rem', padding: '0.2rem 0.5rem', flexShrink: 0 }}
                          aria-label="Click to copy email, double-click to copy password"
                          title="Click = email · double-click = password"
                        >
                          ⎘
                        </button>
                        <button
                          onClick={() => deleteAccount(selectedGroup.id, acc.id)}
                          className="hud-btn hud-btn-danger"
                          style={{ fontSize: '0.65rem', padding: '0.2rem 0.5rem', flexShrink: 0 }}
                          aria-label="Delete this account"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => addAccount(selectedGroup.id)}
                  className="hud-btn w-full"
                  style={{ fontSize: '0.7rem' }}
                  aria-label="Add account to this site"
                >
                  + Add Account
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CredentialVault;
