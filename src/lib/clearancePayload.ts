/**
 * clearancePayload.ts
 *
 * Single source of truth for all client-side storage operations.
 * Imported by SiteClearanceManager (popup) and service-worker (Alt+C).
 *
 * TWO exported functions:
 *
 *   refreshClientStorage()
 *     Client-side only. Wipes readable cookies (nukeCookie), localStorage,
 *     sessionStorage, window.name, IDB, Cache, SW.
 *     Does NOT call chrome.browsingData → HttpOnly session cookies are
 *     physically unreachable from JS and therefore preserved.
 *     You stay logged in.
 *
 *   scorchClientStorage()
 *     Client-side sweep layer. Called AFTER chrome.browsingData has already
 *     wiped the backend (including HttpOnly cookies).
 *     Same vectors as refresh minus nukeCookie (browsingData handled cookies).
 *
 * nukeCookie / getDomains / getPaths ported verbatim from
 * 4ndr0tools - 4ndr0Purge userscript (your own code, §2).
 *
 * Both functions are self-contained — they close over nothing from the
 * extension context. chrome.scripting serialises them before injection.
 */

/* ─── Cookie helpers (ported from userscript §2) ─── */

function getDomains(): string[] {
  const h = location.hostname;
  const parts = h.split('.').filter(Boolean);
  const ds = new Set<string>(['', h, '.' + h]);
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts.slice(i).join('.');
    if (p.split('.').length < 2) continue;
    ds.add(p);
    ds.add('.' + p);
  }
  return [...ds];
}

function getPaths(): string[] {
  const parts = location.pathname.split('/').filter(Boolean);
  const ps = new Set<string>(['/']);
  let cur = '';
  for (const part of parts) {
    cur += '/' + part;
    ps.add(cur);
  }
  return [...ps];
}

function nukeCookie(name: string): void {
  const exp = '=;expires=Thu, 01 Jan 1970 00:00:00 GMT';
  const paths = getPaths();
  const domains = getDomains();
  for (const p of paths) {
    for (const d of domains) {
      const base = `${name}${exp};path=${p}${d ? ';domain=' + d : ''}`;
      document.cookie = base;
      document.cookie = base + ';Secure';
      document.cookie = base + ';SameSite=None;Secure';
      document.cookie = base + ';SameSite=Lax';
      document.cookie = base + ';SameSite=Strict';
    }
  }
}

/* ─── Shared async wipe vectors ─── */

async function wipeStorage(): Promise<void> {
  try { localStorage.clear(); } catch (e) { console.warn('[Ψ] localStorage wipe failed', e); }
  try { sessionStorage.clear(); } catch (e) { console.warn('[Ψ] sessionStorage wipe failed', e); }
  try { window.name = ''; } catch (e) { console.warn('[Ψ] window.name reset failed', e); }
}

async function wipeIDB(): Promise<void> {
  try {
    if (typeof (indexedDB as any)?.databases === 'function') {
      const dbs = await (indexedDB as any).databases();
      await Promise.all(
        dbs.map(
          (db: IDBDatabaseInfo) =>
            new Promise<void>((resolve) => {
              if (!db.name) { resolve(); return; }
              const req = indexedDB.deleteDatabase(db.name);
              req.onsuccess = () => resolve();
              req.onerror = () => resolve();
              req.onblocked = () => resolve();
            }),
        ),
      );
    }
  } catch (e) { console.warn('[Ψ] IDB wipe interrupted', e); }
}

async function wipeCaches(): Promise<void> {
  try {
    if ('caches' in self) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch (e) { console.warn('[Ψ] Cache wipe interrupted', e); }
}

async function wipeSW(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch (e) { console.warn('[Ψ] SW unregister interrupted', e); }
}

/* ─── REFRESH — stay logged in ─── */

export async function refreshClientStorage(): Promise<void> {
  try {
    const cookieNames = document.cookie
      .split(';')
      .map((c) => c.split('=')[0].trim())
      .filter(Boolean);
    cookieNames.forEach(nukeCookie);
  } catch (e) { console.warn('[Ψ] Cookie nuke interrupted', e); }

  await wipeStorage();
  await wipeIDB();
  await wipeCaches();
  await wipeSW();
}

/* ─── SCORCH — scorched earth client layer (after browsingData) ─── */

export async function scorchClientStorage(): Promise<void> {
  await wipeStorage();
  await wipeIDB();
  await wipeCaches();
  await wipeSW();
}
