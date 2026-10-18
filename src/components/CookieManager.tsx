/**
 * CookieManager.tsx
 *
 * Single-site cookie tools: search, view, inline edit, delete, bulk delete,
 * JSON / Netscape export (clipboard + download) and auto-detecting import
 * (via file input or inline paste fallback).
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';

import { Cookie, CookieManagerModule } from '../modules/cookieManager';

const CookieManager: React.FC = () => {
  const [cookies, setCookies] = useState<Cookie[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [hostname, setHostname] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editValue, setEditValue] = useState('');
  const [showPasteImport, setShowPasteImport] = useState(false);
  const [pasteImportText, setPasteImportText] = useState('');
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadCookies();
    return () => {
      if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    };
  }, []);

  const flash = useCallback((message: string) => {
    setFeedback(message);
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setFeedback(null), 1800);
  }, []);

  const loadCookies = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url) {
        try {
          setHostname(new URL(tab.url).hostname);
        } catch {
          setHostname('');
        }
      }
      const siteCookies = await CookieManagerModule.getCookiesForCurrentTab();
      setCookies(siteCookies);
    } catch (error) {
      console.error('Error loading cookies:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteCookie = async (cookie: Cookie) => {
    try {
      const ok = await CookieManagerModule.deleteCookie(cookie);
      flash(ok ? `✓ Deleted ${cookie.name}` : `✗ Failed to delete ${cookie.name}`);
      await loadCookies();
    } catch (error) {
      console.error('Error deleting cookie:', error);
      flash('✗ Delete failed');
    }
  };

  const deleteAllCookies = async () => {
    try {
      const { imported, failed } = await CookieManagerModule.clearAllCookiesForSite();
      flash(`✓ Removed ${imported} cookie(s)${failed ? `, ${failed} failed` : ''}`);
      await loadCookies();
    } catch (error) {
      console.error('Error clearing cookies:', error);
      flash('✗ Bulk delete failed');
    }
  };

  /* ── Clipboard exports (stealth mode — no downloads) ── */
  const exportToClipboard = async (format: 'json' | 'netscape') => {
    try {
      if (cookies.length === 0) {
        flash('No cookies to copy');
        return;
      }
      const content =
        format === 'json'
          ? JSON.stringify(cookies, null, 2)
          : CookieManagerModule.toNetscape(cookies);

      await navigator.clipboard.writeText(content);
      flash(`✓ ${format === 'json' ? 'JSON' : 'Netscape'} copied to clipboard`);
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      flash('✗ Copy failed');
    }
  };

  /* ── File exports ── */
  const exportSiteCookies = (format: 'json' | 'netscape') => {
    if (cookies.length === 0) {
      flash('No cookies to export');
      return;
    }
    if (format === 'json') {
      CookieManagerModule.exportCookies(cookies, hostname);
    } else {
      CookieManagerModule.exportNetscape(cookies, hostname);
    }
    flash(`✓ Exported ${cookies.length} cookie(s) as ${format.toUpperCase()}`);
  };

  /* ── Shared import processor (JSON or Netscape, auto-detected) ── */
  const processImportContent = async (content: string) => {
    let importedCookies: Cookie[];
    try {
      importedCookies = CookieManagerModule.parseImport(content);
    } catch {
      flash('✗ Invalid content — expected JSON or Netscape cookie format');
      return false;
    }

    if (importedCookies.length === 0) {
      flash('✗ No cookies found in input');
      return false;
    }

    const { imported, failed } = await CookieManagerModule.importCookies(importedCookies);
    await loadCookies();
    flash(`✓ Imported ${imported}${failed ? `, ${failed} failed` : ''} cookie(s)`);
    return true;
  };

  const handleImportCookies = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      await processImportContent(content);
    } catch (error) {
      console.error('Error importing cookies:', error);
      flash('✗ Import failed');
    } finally {
      event.target.value = '';
    }
  };

  const handlePasteImportSubmit = async () => {
    if (!pasteImportText.trim()) {
      flash('✗ Paste JSON or Netscape cookie text first');
      return;
    }
    try {
      const ok = await processImportContent(pasteImportText);
      if (ok) {
        setPasteImportText('');
        setShowPasteImport(false);
      }
    } catch (error) {
      console.error('Error importing pasted cookies:', error);
      flash('✗ Paste import failed');
    }
  };

  /* ── Inline editing (Delta) ── */
  const startEdit = (cookie: Cookie) => {
    setEditingId(`${cookie.domain}|${cookie.name}|${cookie.path}`);
    setEditName(cookie.name);
    setEditValue(cookie.value);
  };

  const saveEdit = async (cookie: Cookie) => {
    const ok = await CookieManagerModule.updateCookie(cookie, {
      name: editName.trim(),
      value: editValue,
    });
    flash(ok ? '✓ Cookie updated' : '✗ Update failed');
    setEditingId(null);
    await loadCookies();
  };

  const filteredCookies = cookies.filter(
    (cookie) =>
      cookie.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cookie.domain.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
      </div>
    );
  }

  return (
    <div className="hud-card">
      {/* Header */}
      <div className="border-b border-cyan-300/20 px-4 sm:px-6 py-3 sm:py-4">
        <h2 className="hud-title">Cookie Tools</h2>
        <p className="text-sm text-gray-400">
          {hostname ? `${hostname} — ` : ''}export (JSON/Netscape), import, edit
        </p>
      </div>

      <div className="p-4">
        <div className="hud-section mb-4">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <input
              type="text"
              placeholder="Search cookies..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="hud-input flex-1 min-w-0"
              aria-label="Search cookies"
            />
            <button
              onClick={() => exportToClipboard('json')}
              className="hud-btn flex-shrink-0"
            >
              📋 Copy JSON
            </button>
            <button
              onClick={() => exportToClipboard('netscape')}
              className="hud-btn flex-shrink-0"
            >
              📋 Copy Netscape
            </button>
            <label htmlFor="import-cookies-file" className="hud-btn flex-shrink-0 cursor-pointer">
              📥 Import File
            </label>
            <input
              type="file"
              id="import-cookies-file"
              accept=".json,.txt"
              className="hidden"
              onChange={handleImportCookies}
            />
            <button
              type="button"
              onClick={() => setShowPasteImport(!showPasteImport)}
              className="hud-btn flex-shrink-0"
              aria-label="Toggle paste cookie import"
            >
              {showPasteImport ? '✕ Close Paste' : '📋 Paste Import'}
            </button>
            <button
              onClick={() => exportSiteCookies('json')}
              disabled={cookies.length === 0}
              className="hud-btn flex-shrink-0"
            >
              📤 Export JSON
            </button>
            <button
              onClick={() => exportSiteCookies('netscape')}
              disabled={cookies.length === 0}
              className="hud-btn flex-shrink-0"
            >
              📤 Export Netscape
            </button>
            <button
              onClick={deleteAllCookies}
              disabled={cookies.length === 0}
              className="hud-btn hud-btn-danger flex-shrink-0"
            >
              🗑️ Delete All
            </button>
          </div>

          {showPasteImport && (
            <div className="space-y-2 mb-3">
              <textarea
                rows={4}
                value={pasteImportText}
                onChange={(e) => setPasteImportText(e.target.value)}
                placeholder="Paste JSON cookie array or Netscape HTTP Cookie File lines here…"
                className="hud-input font-mono text-xs"
                aria-label="Paste cookies to import"
              />
              <button
                type="button"
                onClick={handlePasteImportSubmit}
                className="hud-btn w-full"
                aria-label="Import pasted cookies"
              >
                📥 Import Pasted Cookies
              </button>
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>
              Found {filteredCookies.length} cookie{filteredCookies.length !== 1 ? 's' : ''} for this site
            </span>
          </div>
        </div>

        {feedback && (
          <div
            className="text-xs text-center py-1 mb-3 rounded"
            style={{ color: 'var(--text-cyan-active)', background: 'rgba(0,229,255,0.08)' }}
            role="status"
          >
            {feedback}
          </div>
        )}

        <div className="space-y-2 max-h-80 overflow-y-auto">
          {filteredCookies.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              No cookies found for this site
            </div>
          ) : (
            filteredCookies.map((cookie) => {
              const rowId = `${cookie.domain}|${cookie.name}|${cookie.path}`;
              const isEditing = editingId === rowId;

              return isEditing ? (
                <div key={rowId} className="hud-section space-y-2" style={{ borderColor: 'var(--accent-cyan-border-hover)' }}>
                  <div className="flex items-center gap-2">
                    <input
                      className="hud-input flex-1"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Cookie name"
                      aria-label="Cookie name"
                      autoFocus
                    />
                    <button
                      onClick={() => saveEdit(cookie)}
                      className="hud-btn flex-shrink-0"
                      aria-label="Save cookie"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="hud-btn flex-shrink-0"
                      aria-label="Cancel edit"
                    >
                      Cancel
                    </button>
                  </div>
                  <input
                    className="hud-input"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    placeholder="Cookie value"
                    aria-label="Cookie value"
                  />
                </div>
              ) : (
                <div key={rowId} className="hud-section flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-cyan-400">{cookie.name}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      Domain: {cookie.domain} | Path: {cookie.path}
                    </div>
                    <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-1">
                      {cookie.secure && <span className="bg-cyan-600 text-white px-1 rounded text-xs">Secure</span>}
                      {cookie.httpOnly && <span className="bg-cyan-600 text-white px-1 rounded text-xs">HttpOnly</span>}
                      {cookie.session && <span className="bg-gray-600 text-white px-1 rounded text-xs">Session</span>}
                      {cookie.expirationDate && (
                        <span className="text-gray-400">
                          Expires: {new Date(cookie.expirationDate * 1000).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-1 truncate">
                      Value: {cookie.value.length > 50 ? cookie.value.substring(0, 50) + '...' : cookie.value}
                    </div>
                  </div>
                  <div className="flex ml-2 gap-1 flex-shrink-0">
                    <button
                      onClick={() => startEdit(cookie)}
                      className="hud-btn"
                      style={{ fontSize: '0.65rem', padding: '0.2rem 0.5rem' }}
                      aria-label={`Edit cookie ${cookie.name}`}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteCookie(cookie)}
                      className="hud-btn hud-btn-danger"
                      style={{ fontSize: '0.65rem', padding: '0.2rem 0.5rem' }}
                      aria-label={`Delete cookie ${cookie.name}`}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default CookieManager;
