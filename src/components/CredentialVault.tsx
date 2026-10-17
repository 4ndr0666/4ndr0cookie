/**
 * CredentialVault.tsx
 *
 * Grouped throwaway-identity rotation tracker & encrypted credential store
 * (consolidates legacy Email List Manager, PasteManager, and flat Vault).
 *
 * Security & Storage Redesign:
 *  - Zero hardcoded credentials or PII in source code (empty default state).
 *  - Optional at-rest AES-256-GCM encryption in chrome.storage.local
 *    (`VaultStorageEnvelope` with PBKDF2-HMAC-SHA256, 310,000 iterations)
 *    paired with ephemeral session caching in `chrome.storage.session`.
 *  - Automatic migration and immediate scrubbing of legacy storage keys
 *    (`emailGroups`, `emailList`, `pasteEntries`, `pasteManagerItems`).
 *
 * Capabilities (Full Superset of main + v1.1.1):
 *  - Quick-copy: single click copies email, double-click copies password.
 *    Every successful copy stamps `lastUsed` for rotation tracking.
 *  - Next-up: the first Fresh account in a group is marked `▸ NEXT IN ROTATION`.
 *  - Search filter: instant filtering across site names, notes, labels, and emails.
 *  - Bulk copy: all emails, or "label: email" lines.
 *  - Text import: "label: email: password", "email: password", "label: email",
 *    bare "email", or "label: secret" lines.
 *  - Export/import: AES-256-GCM encrypted .vault file ("4ntv" binary + JSON envelope).
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';

import {
  Account,
  SiteGroup,
  VaultStorageEnvelope,
  STATUS_CYCLE,
  STATUS_LABEL,
  uid,
  timeAgo,
  parseAccountLine,
  mergeImportedGroups,
  encryptVaultBlob,
  decryptVaultBinary,
  loadVaultFromStorage,
  saveVaultToStorage,
  unsealVaultStorage,
  setSessionVaultCache,
  clearSessionVaultCache,
} from '../modules/credentialVault';

type PromptMode = 'export' | 'import' | 'seal' | 'unseal' | null;

const CredentialVault: React.FC = () => {
  const [groups, setGroups] = useState<SiteGroup[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [popoverSiteId, setPopoverSiteId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [copyFeedback, setCopyFeedback] = useState<string>('');
  const [vaultPassword, setVaultPassword] = useState('');
  const [showPwPrompt, setShowPwPrompt] = useState<PromptMode>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importText, setImportText] = useState('');
  const [showTextImport, setShowTextImport] = useState(false);

  /* At-rest encryption state */
  const [isSealed, setIsSealed] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [storedEnvelope, setStoredEnvelope] = useState<VaultStorageEnvelope | null>(null);
  const [unlockPassphrase, setUnlockPassphrase] = useState('');

  const importRef = useRef<HTMLInputElement>(null);
  const clickTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const flash = useCallback((msg: string) => {
    setCopyFeedback(msg);
    setTimeout(() => setCopyFeedback(''), 1800);
  }, []);

  /* ── Load + legacy migration & key scrubbing ── */
  useEffect(() => {
    (async () => {
      try {
        const state = await loadVaultFromStorage();
        setIsSealed(state.sealed);
        setIsLocked(state.locked);
        setStoredEnvelope(state.envelope);
        setGroups(state.groups);
        setSelectedId(state.groups[0]?.id ?? null);
        if (state.migratedKeysPurged.length > 0) {
          flash(`✓ Migrated & scrubbed ${state.migratedKeysPurged.length} legacy key(s)`);
        }
      } catch (e) {
        console.error('Vault load failed:', e);
        setGroups([]);
        setSelectedId(null);
      }
    })();

    return () => {
      Object.values(clickTimers.current).forEach(clearTimeout);
    };
  }, [flash]);

  const persist = useCallback(
    (next: SiteGroup[]) => {
      setGroups(next);
      saveVaultToStorage(next, { sealed: isSealed })
        .then((env) => {
          if (env) setStoredEnvelope(env);
        })
        .catch(console.error);
    },
    [isSealed],
  );

  /* ── Filtered groups & active selection ── */
  const normalizedQuery = searchTerm.trim().toLowerCase();
  const filteredGroups = normalizedQuery
    ? groups.filter(
        (g) =>
          g.site.toLowerCase().includes(normalizedQuery) ||
          g.note.toLowerCase().includes(normalizedQuery) ||
          g.accounts.some(
            (a) =>
              a.email.toLowerCase().includes(normalizedQuery) ||
              a.label.toLowerCase().includes(normalizedQuery),
          ),
      )
    : groups;

  const selectedGroup = groups.find((g) => g.id === selectedId) ?? null;

  /* Next account in the rotation: first Fresh account of the group */
  const nextUpId = selectedGroup
    ? selectedGroup.accounts.find((a) => a.status === 'fresh')?.id ?? null
    : null;

  /* ── Copy helpers + rotation stamping ── */
  const stampUsed = useCallback(
    (accId: string) => {
      setGroups((prev) => {
        const next = prev.map((g) => ({
          ...g,
          accounts: g.accounts.map((a) =>
            a.id === accId ? { ...a, lastUsed: Date.now() } : a,
          ),
        }));
        saveVaultToStorage(next, { sealed: isSealed })
          .then((env) => {
            if (env) setStoredEnvelope(env);
          })
          .catch(console.error);
        return next;
      });
    },
    [isSealed],
  );

  const copyText = async (text: string, label: string, accId?: string) => {
    if (!text) {
      flash(`✗ No ${label.toLowerCase()} saved`);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      flash(`✓ ${label} copied`);
      if (accId) stampUsed(accId);
    } catch {
      flash('✗ copy failed');
    }
  };

  /* Single click → email; double click → password */
  const handleAccountClick = (acc: Account) => {
    const id = acc.id;
    if (clickTimers.current[id]) {
      clearTimeout(clickTimers.current[id]);
      delete clickTimers.current[id];
      copyText(acc.password, 'Password', id);
    } else {
      clickTimers.current[id] = setTimeout(() => {
        delete clickTimers.current[id];
        copyText(acc.email, 'Email', id);
      }, 250);
    }
  };

  /* ── Group mutations ── */
  const addGroup = () => {
    const ng: SiteGroup = { id: uid(), site: '', note: '', accounts: [] };
    persist([...groups, ng]);
    setSelectedId(ng.id);
  };

  const deleteGroup = (id: string) => {
    const next = groups.filter((g) => g.id !== id);
    persist(next);
    setSelectedId(next[0]?.id ?? null);
  };

  const updateGroup = (id: string, field: 'site' | 'note', value: string) => {
    persist(groups.map((g) => (g.id === id ? { ...g, [field]: value } : g)));
  };

  /* ── Account mutations ── */
  const addAccount = (groupId: string) => {
    const na: Account = {
      id: uid(),
      label: '',
      email: '',
      password: '',
      hidden: true,
      status: 'fresh',
      lastUsed: 0,
    };
    persist(
      groups.map((g) =>
        g.id === groupId ? { ...g, accounts: [...g.accounts, na] } : g,
      ),
    );
  };

  const deleteAccount = (groupId: string, accId: string) => {
    persist(
      groups.map((g) =>
        g.id === groupId
          ? { ...g, accounts: g.accounts.filter((a) => a.id !== accId) }
          : g,
      ),
    );
  };

  const updateAccount = (
    groupId: string,
    accId: string,
    field: 'label' | 'email' | 'password',
    value: string,
  ) => {
    persist(
      groups.map((g) =>
        g.id === groupId
          ? {
              ...g,
              accounts: g.accounts.map((a) =>
                a.id === accId ? { ...a, [field]: value } : a,
              ),
            }
          : g,
      ),
    );
  };

  const toggleHidden = (groupId: string, accId: string) => {
    persist(
      groups.map((g) =>
        g.id === groupId
          ? {
              ...g,
              accounts: g.accounts.map((a) =>
                a.id === accId ? { ...a, hidden: !a.hidden } : a,
              ),
            }
          : g,
      ),
    );
  };

  const cycleStatus = (groupId: string, accId: string) => {
    persist(
      groups.map((g) =>
        g.id === groupId
          ? {
              ...g,
              accounts: g.accounts.map((a) => {
                if (a.id !== accId) return a;
                const idx = STATUS_CYCLE.indexOf(a.status);
                return {
                  ...a,
                  status: STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length],
                };
              }),
            }
          : g,
      ),
    );
  };

  /* ── Bulk copy (legacy email-list capability, group-scoped) ── */
  const copyAllEmails = () => {
    if (!selectedGroup) return;
    const emails = selectedGroup.accounts.map((a) => a.email).filter(Boolean);
    if (emails.length === 0) {
      flash('✗ No emails in this group');
      return;
    }
    copyText(emails.join('\n'), `${emails.length} email(s)`);
  };

  const copyAllLabeled = () => {
    if (!selectedGroup) return;
    const lines = selectedGroup.accounts
      .filter((a) => a.email)
      .map((a) => (a.label ? `${a.label}: ${a.email}` : a.email));
    if (lines.length === 0) {
      flash('✗ No emails in this group');
      return;
    }
    copyText(lines.join('\n'), `${lines.length} labeled entr(ies)`);
  };

  /* ── Text import ── */
  const importFromText = () => {
    if (!selectedGroup) return;
    const lines = importText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const parsed = lines
      .map(parseAccountLine)
      .filter((a): a is NonNullable<typeof a> => a !== null);

    if (parsed.length === 0) {
      flash('✗ No valid lines found');
      return;
    }

    const accounts: Account[] = parsed.map((p) => ({
      id: uid(),
      label: p.label,
      email: p.email,
      password: p.password,
      hidden: true,
      status: 'fresh',
      lastUsed: 0,
    }));

    persist(
      groups.map((g) =>
        g.id === selectedGroup.id
          ? { ...g, accounts: [...g.accounts, ...accounts] }
          : g,
      ),
    );
    setImportText('');
    setShowTextImport(false);
    flash(`✓ Imported ${accounts.length} account(s)`);
  };

  /* ── At-rest vault sealing, locking & unlocking ── */
  const handleSealVault = async () => {
    if (!vaultPassword.trim()) return;
    try {
      const env = await saveVaultToStorage(groups, {
        sealed: true,
        passphrase: vaultPassword,
      });
      setStoredEnvelope(env);
      setIsSealed(true);
      setIsLocked(false);
      setShowPwPrompt(null);
      setVaultPassword('');
      flash('✓ Vault sealed with AES-256-GCM at rest');
    } catch (e) {
      console.error(e);
      flash('✗ Failed to seal vault');
    }
  };

  const handleUnsealVault = async () => {
    if (!vaultPassword.trim()) return;
    try {
      if (storedEnvelope) {
        await unsealVaultStorage(storedEnvelope, vaultPassword);
      }
      await clearSessionVaultCache();
      await chrome.storage.local.set({ credentialVault: groups });
      setStoredEnvelope(null);
      setIsSealed(false);
      setIsLocked(false);
      setShowPwPrompt(null);
      setVaultPassword('');
      flash('✓ At-rest passphrase lock removed');
    } catch (e) {
      console.error(e);
      flash('✗ Incorrect passphrase');
    }
  };

  const handleLockSession = async () => {
    if (!isSealed) {
      setShowPwPrompt('seal');
      return;
    }
    await clearSessionVaultCache();
    setGroups([]);
    setSelectedId(null);
    setIsLocked(true);
    flash('🔒 Vault locked');
  };

  const handleUnlockSession = async () => {
    if (!unlockPassphrase || !storedEnvelope) return;
    try {
      const unlocked = await unsealVaultStorage(storedEnvelope, unlockPassphrase);
      await setSessionVaultCache(unlocked, unlockPassphrase);
      setGroups(unlocked);
      setSelectedId(unlocked[0]?.id ?? null);
      setIsLocked(false);
      setUnlockPassphrase('');
      flash('✓ Vault unlocked');
    } catch (e) {
      console.error(e);
      flash('✗ Decryption failed — wrong passphrase?');
    }
  };

  /* ── Encrypted .vault file export/import ── */
  const handleExport = async () => {
    if (!vaultPassword) return;
    try {
      const blob = await encryptVaultBlob(groups, vaultPassword);
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
      const imported = await decryptVaultBinary(buf, vaultPassword);
      const { groups: merged, addedGroups, addedAccounts } = mergeImportedGroups(
        groups,
        imported,
      );

      persist(merged);
      if (!selectedId && merged[0]) setSelectedId(merged[0].id);
      setShowPwPrompt(null);
      setVaultPassword('');
      setImportFile(null);
      if (importRef.current) importRef.current.value = '';
      flash(
        addedGroups > 0
          ? `✓ Imported ${addedGroups} group(s), ${addedAccounts} account(s)`
          : `✓ Merged ${addedAccounts} account(s)`,
      );
    } catch (e) {
      flash('✗ Decryption failed — wrong password?');
      console.error(e);
    }
  };

  const executePromptAction = () => {
    if (showPwPrompt === 'export') handleExport();
    else if (showPwPrompt === 'import') handleImport();
    else if (showPwPrompt === 'seal') handleSealVault();
    else if (showPwPrompt === 'unseal') handleUnsealVault();
  };

  /* ─── Render ─── */
  return (
    <div className="hud-card flex flex-col" style={{ minHeight: 420 }}>
      {/* Header */}
      <div
        className="border-b px-4 py-3 flex items-center justify-between"
        style={{ borderColor: 'var(--accent-cyan-border-idle)' }}
      >
        <div>
          <h2 className="hud-title" style={{ marginBottom: 0 }}>
            Credential Vault
          </h2>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Click email to copy · double-click password · rotation auto-tracked
          </p>
        </div>
        <div className="flex gap-1">
          {!isLocked && (
            <>
              <button
                onClick={handleLockSession}
                className="hud-btn"
                style={{ fontSize: '0.65rem', padding: '0.2rem 0.5rem' }}
                aria-label={isSealed ? 'Lock vault session' : 'Seal vault with passphrase'}
                title={
                  isSealed
                    ? 'Lock session (wipes in-memory cache)'
                    : 'Encrypt vault at rest in storage with a master passphrase'
                }
              >
                {isSealed ? '🔒 Lock' : '🛡️ Seal'}
              </button>
              {isSealed && (
                <button
                  onClick={() => setShowPwPrompt('unseal')}
                  className="hud-btn"
                  style={{ fontSize: '0.65rem', padding: '0.2rem 0.5rem' }}
                  aria-label="Remove at-rest passphrase lock"
                  title="Remove at-rest passphrase lock"
                >
                  🔓 Unseal
                </button>
              )}
              <button
                onClick={() => setShowPwPrompt('export')}
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
            </>
          )}
          <input
            ref={importRef}
            type="file"
            accept=".vault,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setImportFile(f);
                setShowPwPrompt('import');
              }
            }}
          />
        </div>
      </div>

      {/* Copy feedback toast */}
      {copyFeedback && (
        <div
          className="text-xs text-center py-1"
          style={{ color: 'var(--accent-cyan)', background: 'rgba(0,229,255,0.08)' }}
          role="status"
        >
          {copyFeedback}
        </div>
      )}

      {/* Locked Vault Gate */}
      {isLocked && (
        <div className="p-6 flex-1 flex flex-col justify-center space-y-4">
          <div className="text-center space-y-1">
            <p className="hud-title" style={{ marginBottom: 0 }}>
              🔒 Vault Sealed (AES-256-GCM)
            </p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Credentials are encrypted at rest. Enter your master passphrase to unlock for this browser session.
            </p>
          </div>
          <input
            type="password"
            className="hud-input"
            value={unlockPassphrase}
            onChange={(e) => setUnlockPassphrase(e.target.value)}
            placeholder="Master passphrase…"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleUnlockSession();
            }}
            aria-label="Master vault passphrase"
            autoFocus
          />
          <button
            onClick={handleUnlockSession}
            disabled={!unlockPassphrase}
            className="hud-btn w-full"
            style={{ fontSize: '0.75rem' }}
            aria-label="Unlock vault"
          >
            🔓 Unlock Vault
          </button>
        </div>
      )}

      {/* Password prompt overlay (export / import / seal / unseal) */}
      {!isLocked && showPwPrompt && (
        <div
          className="p-4 space-y-3"
          style={{
            background: 'rgba(5,10,15,0.9)',
            border: '1px solid var(--accent-cyan-border-hover)',
            borderRadius: 6,
          }}
        >
          <p className="text-xs" style={{ color: 'var(--text-cyan-active)' }}>
            {showPwPrompt === 'export' && 'Set a password to encrypt your .vault export:'}
            {showPwPrompt === 'import' && `Decryption password for "${importFile?.name}":`}
            {showPwPrompt === 'seal' &&
              'Set a master passphrase to encrypt the vault at rest in chrome.storage.local (AES-256-GCM):'}
            {showPwPrompt === 'unseal' &&
              'Confirm current master passphrase to remove at-rest encryption:'}
          </p>
          <input
            type="password"
            className="hud-input"
            value={vaultPassword}
            onChange={(e) => setVaultPassword(e.target.value)}
            placeholder="Vault password…"
            onKeyDown={(e) => {
              if (e.key === 'Enter') executePromptAction();
            }}
            aria-label="Vault password"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              onClick={executePromptAction}
              disabled={!vaultPassword}
              className="hud-btn flex-1"
              style={{ fontSize: '0.75rem' }}
            >
              {showPwPrompt === 'export' && '↑ Encrypt & Export'}
              {showPwPrompt === 'import' && '↓ Decrypt & Import'}
              {showPwPrompt === 'seal' && '🛡️ Seal Vault'}
              {showPwPrompt === 'unseal' && '🔓 Confirm Unseal'}
            </button>
            <button
              onClick={() => {
                setShowPwPrompt(null);
                setVaultPassword('');
                setImportFile(null);
                if (importRef.current) importRef.current.value = '';
              }}
              className="hud-btn"
              style={{ fontSize: '0.75rem' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Main body — left panel + right panel */}
      {!isLocked && !showPwPrompt && (
        <div className="flex flex-1 overflow-hidden" style={{ minHeight: 320 }}>
          {/* Left — site list + search */}
          <div
            className="flex flex-col"
            style={{
              width: 150,
              borderRight: '1px solid var(--accent-cyan-border-idle)',
              overflowY: 'auto',
            }}
          >
            <div className="p-2 space-y-1.5">
              <button
                onClick={addGroup}
                className="hud-btn w-full"
                style={{ fontSize: '0.65rem', padding: '0.2rem 0.4rem' }}
                aria-label="Add new site group"
              >
                + Add Site
              </button>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filter sites…"
                className="hud-input"
                style={{ fontSize: '0.65rem', padding: '0.2rem 0.4rem' }}
                aria-label="Search credentials"
              />
            </div>
            {filteredGroups.map((g) => (
              <div
                key={g.id}
                className="relative group"
                style={{
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                }}
              >
                <button
                  onClick={() => {
                    setSelectedId(g.id);
                    setPopoverSiteId(null);
                  }}
                  onDoubleClick={() =>
                    setPopoverSiteId(popoverSiteId === g.id ? null : g.id)
                  }
                  title="Click to select · double-click for quick-copy popover"
                  className="w-full text-left px-3 py-2 text-xs truncate transition-colors"
                  style={{
                    color:
                      selectedId === g.id
                        ? 'var(--accent-cyan)'
                        : 'var(--text-secondary)',
                    background:
                      selectedId === g.id
                        ? 'var(--accent-cyan-bg-active)'
                        : 'transparent',
                    borderLeft:
                      selectedId === g.id
                        ? '2px solid var(--accent-cyan)'
                        : '2px solid transparent',
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
                    <p
                      className="text-xs mb-1"
                      style={{ color: 'var(--text-secondary)' }}
                    >
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
                          className={`text-xs px-1 rounded status-${a.status}`}
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
              <div className="text-xs text-center pt-8 space-y-2" style={{ color: 'var(--text-secondary)' }}>
                <p>No site selected. Add a site or import an encrypted .vault file →</p>
              </div>
            ) : (
              <>
                {/* Site name + note + delete group */}
                <div className="hud-section space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      className="hud-input flex-1"
                      value={selectedGroup.site}
                      onChange={(e) =>
                        updateGroup(selectedGroup.id, 'site', e.target.value)
                      }
                      placeholder="Site name…"
                      aria-label="Site name"
                    />
                    <button
                      onClick={() => deleteGroup(selectedGroup.id)}
                      className="hud-btn hud-btn-danger"
                      style={{
                        fontSize: '0.65rem',
                        padding: '0.2rem 0.5rem',
                        flexShrink: 0,
                      }}
                      aria-label="Delete this site group"
                    >
                      ✕
                    </button>
                  </div>
                  <input
                    className="hud-input"
                    value={selectedGroup.note}
                    onChange={(e) =>
                      updateGroup(selectedGroup.id, 'note', e.target.value)
                    }
                    placeholder="Notes — 2FA, credits, trial details…"
                    aria-label="Site notes"
                  />
                  {/* Bulk actions (email-list capability, group-scoped) */}
                  <div className="flex flex-wrap gap-1">
                    <button
                      onClick={copyAllEmails}
                      className="hud-btn"
                      style={{ fontSize: '0.6rem', padding: '0.2rem 0.4rem' }}
                      aria-label="Copy all emails in this group"
                    >
                      ⧉ Copy Emails
                    </button>
                    <button
                      onClick={copyAllLabeled}
                      className="hud-btn"
                      style={{ fontSize: '0.6rem', padding: '0.2rem 0.4rem' }}
                      aria-label="Copy all labeled entries (label: email)"
                    >
                      ⧉ Copy Labeled
                    </button>
                    <button
                      onClick={() => setShowTextImport(!showTextImport)}
                      className="hud-btn"
                      style={{ fontSize: '0.6rem', padding: '0.2rem 0.4rem' }}
                      aria-label="Toggle text import"
                    >
                      {showTextImport ? '✕ Close Import' : '↓ Import Text'}
                    </button>
                  </div>
                  {showTextImport && (
                    <div className="space-y-2">
                      <textarea
                        className="hud-input"
                        rows={3}
                        value={importText}
                        onChange={(e) => setImportText(e.target.value)}
                        placeholder={
                          'One per line:\nlabel: email: password\nemail: password\nlabel: email\nemail'
                        }
                        aria-label="Accounts to import"
                      />
                      <button
                        onClick={importFromText}
                        className="hud-btn w-full"
                        style={{ fontSize: '0.65rem' }}
                        aria-label="Import accounts from text"
                      >
                        + Import Accounts
                      </button>
                    </div>
                  )}
                </div>

                {/* Account rows */}
                <div className="space-y-2">
                  {selectedGroup.accounts.map((acc) => (
                    <div key={acc.id} className="hud-section space-y-1">
                      {/* Label + email row */}
                      <div className="flex items-center gap-2">
                        <input
                          className="hud-input"
                          style={{ width: 80, flexShrink: 0 }}
                          value={acc.label}
                          onChange={(e) =>
                            updateAccount(
                              selectedGroup.id,
                              acc.id,
                              'label',
                              e.target.value,
                            )
                          }
                          placeholder="m1…"
                          aria-label="Account label"
                          title="Short label (m1, m2…)"
                        />
                        <input
                          className="hud-input flex-1 min-w-0"
                          value={acc.email}
                          onChange={(e) =>
                            updateAccount(
                              selectedGroup.id,
                              acc.id,
                              'email',
                              e.target.value,
                            )
                          }
                          placeholder="Email…"
                          aria-label="Account email"
                        />
                        {/* Status badge — click to cycle */}
                        <button
                          onClick={() => cycleStatus(selectedGroup.id, acc.id)}
                          className={`text-xs px-2 py-1 rounded cursor-pointer transition-all status-${acc.status}`}
                          style={{
                            flexShrink: 0,
                            fontFamily: 'var(--font-body)',
                            fontSize: '0.65rem',
                          }}
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
                          className="hud-input flex-1 min-w-0"
                          value={acc.password}
                          onChange={(e) =>
                            updateAccount(
                              selectedGroup.id,
                              acc.id,
                              'password',
                              e.target.value,
                            )
                          }
                          placeholder="Password…"
                          aria-label="Account password"
                        />
                        <button
                          onClick={() => toggleHidden(selectedGroup.id, acc.id)}
                          className="hud-btn"
                          style={{
                            fontSize: '0.65rem',
                            padding: '0.2rem 0.5rem',
                            flexShrink: 0,
                          }}
                          aria-label={acc.hidden ? 'Show password' : 'Hide password'}
                        >
                          <span className="hud-icon">{acc.hidden ? '👁' : '🙈'}</span>
                        </button>
                        <button
                          onClick={() => handleAccountClick(acc)}
                          className="hud-btn"
                          style={{
                            fontSize: '0.65rem',
                            padding: '0.2rem 0.5rem',
                            flexShrink: 0,
                          }}
                          aria-label="Click to copy email, double-click to copy password"
                          title="Click = email · double-click = password"
                        >
                          <span className="hud-icon">⎘</span>
                        </button>
                        <button
                          onClick={() => deleteAccount(selectedGroup.id, acc.id)}
                          className="hud-btn hud-btn-danger"
                          style={{
                            fontSize: '0.65rem',
                            padding: '0.2rem 0.5rem',
                            flexShrink: 0,
                          }}
                          aria-label="Delete this account"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Rotation meta */}
                      <div
                        className="flex items-center gap-2 text-xs"
                        style={{ color: 'var(--text-secondary)' }}
                      >
                        {acc.id === nextUpId && (
                          <span
                            className="px-1 rounded"
                            style={{
                              color: 'var(--accent-cyan)',
                              border: '1px solid var(--accent-cyan-border-hover)',
                              fontSize: '0.6rem',
                            }}
                            title="First fresh account in this group"
                          >
                            ▸ NEXT IN ROTATION
                          </span>
                        )}
                        <span>{timeAgo(acc.lastUsed)}</span>
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
