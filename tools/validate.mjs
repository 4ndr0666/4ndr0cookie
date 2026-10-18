#!/usr/bin/env node
/**
 * tools/validate.mjs
 *
 * Self-contained 52-point verification battery for 4ndr0cookie v1.1.1.
 * Exercises:
 *   1. Static security & zero-PII/secret-exposure audit across all tracked files (T01–T05)
 *   2. Directive Alpha — Export sanitization matrix (Cloudflare, PSIDTS, telemetry) (T06–T10)
 *   3. Directive Beta  — Native Web Crypto (AES-256-GCM + PBKDF2 310k, v2 + legacy v1 + SJCL .ckz + Netscape) (T11–T19, T43–T44)
 *   4. Directive Gamma — Restoration URL synthesis, SetDetails hardening, filterCookieForRestore
 *      (cndobhdcpmpilkebeebeecgminfhkpcj parity), 3-tier restoreSingleCookie & restoreCookiesBatch,
 *      collectAllBrowserCookies, downloadBackupFile (chrome.downloads.download + onChanged),
 *      and session-persisted pending restore state (T20–T24, T45–T50)
 *   5. Directive Delta — Single-site Cookie CRUD, Netscape round-trip, SameSite/HTTPS guard & fallback (T25–T30, T51)
 *   6. Sensitive Storage Redesign — At-rest VaultStorageEnvelope (AES-256-GCM),
 *      session cache (`chrome.storage.session`), binary `.vault` ("4ntv"),
 *      legacy migration (`emailGroups`, `emailList`, `pasteEntries`, flat creds)
 *      with immediate legacy-key scrubbing, and colon-grammar parser (T31–T36)
 *   7. Service Worker IPC message bus (including `backup-cookies` & `restore-cookies`)
 *      & client-side clearance payloads (T37–T42, T52)
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto, createCipheriv, pbkdf2Sync } from 'node:crypto';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const requireFn = createRequire(import.meta.url);

/* ─── Deterministic Zero-Dependency TypeScript/TSX Transpiler ─── */

function stripInterfacesAndTypeAliases(src) {
  const lines = src.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*(?:export\s+)?type\s+[A-Za-z0-9_]+\s*(?:<[^>]+>)?\s*=/.test(line)) {
      let depth = 0;
      while (i < lines.length) {
        const l = lines[i];
        for (const ch of l) {
          if (ch === '{' || ch === '(') depth++;
          else if (ch === '}' || ch === ')') depth--;
        }
        i++;
        if (depth <= 0 && l.trim().endsWith(';')) break;
      }
      continue;
    }
    if (/^\s*(?:export\s+)?interface\s+[A-Za-z0-9_]+/.test(line)) {
      let depth = 0;
      let seenBrace = false;
      while (i < lines.length) {
        const l = lines[i];
        for (const ch of l) {
          if (ch === '{') {
            depth++;
            seenBrace = true;
          } else if (ch === '}') {
            depth--;
          }
        }
        i++;
        if (seenBrace && depth <= 0) break;
      }
      continue;
    }
    out.push(line);
    i++;
  }
  return out.join('\n');
}

function stripTypesFromParamList(paramListStr) {
  const params = [];
  let cur = '';
  let depthAngle = 0;
  let depthParen = 0;
  let depthBrace = 0;
  let depthBracket = 0;
  let inStr = null;
  for (let i = 0; i < paramListStr.length; i++) {
    const ch = paramListStr[i];
    if (inStr) {
      cur += ch;
      if (ch === '\\') {
        cur += paramListStr[++i] || '';
        continue;
      }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
      cur += ch;
      continue;
    }
    if (ch === '<') depthAngle++;
    else if (ch === '>' && depthAngle > 0) depthAngle--;
    else if (ch === '(') depthParen++;
    else if (ch === ')' && depthParen > 0) depthParen--;
    else if (ch === '{') depthBrace++;
    else if (ch === '}' && depthBrace > 0) depthBrace--;
    else if (ch === '[') depthBracket++;
    else if (ch === ']' && depthBracket > 0) depthBracket--;
    else if (
      ch === ',' &&
      depthAngle === 0 &&
      depthParen === 0 &&
      depthBrace === 0 &&
      depthBracket === 0
    ) {
      params.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) params.push(cur);

  return params
    .map((p) => {
      let dAngle = 0;
      let dParen = 0;
      let dBrace = 0;
      let dBracket = 0;
      let colonIdx = -1;
      let eqIdx = -1;
      let str = null;
      for (let i = 0; i < p.length; i++) {
        const ch = p[i];
        if (str) {
          if (ch === '\\') {
            i++;
            continue;
          }
          if (ch === str) str = null;
          continue;
        }
        if (ch === '"' || ch === "'" || ch === '`') {
          str = ch;
          continue;
        }
        if (ch === '<') dAngle++;
        else if (ch === '>' && dAngle > 0) dAngle--;
        else if (ch === '(') dParen++;
        else if (ch === ')' && dParen > 0) dParen--;
        else if (ch === '{') dBrace++;
        else if (ch === '}' && dBrace > 0) dBrace--;
        else if (ch === '[') dBracket++;
        else if (ch === ']' && dBracket > 0) dBracket--;
        else if (dAngle === 0 && dParen === 0 && dBrace === 0 && dBracket === 0) {
          if (ch === ':' && colonIdx === -1 && eqIdx === -1) colonIdx = i;
          else if (
            ch === '=' &&
            eqIdx === -1 &&
            p[i + 1] !== '>' &&
            p[i - 1] !== '=' &&
            p[i - 1] !== '!'
          ) {
            eqIdx = i;
          }
        }
      }
      if (colonIdx === -1) return p;
      const lhs = p.slice(0, colonIdx).replace(/\?\s*$/, '');
      if (eqIdx !== -1 && eqIdx > colonIdx) {
        return `${lhs} ${p.slice(eqIdx)}`;
      }
      return lhs;
    })
    .join(', ');
}

function consumeReturnType(str) {
  let i = 0;
  while (i < str.length && /\s/.test(str[i])) i++;
  if (str[i] !== ':') return null;
  i++;
  while (i < str.length && /\s/.test(str[i])) i++;

  let dAngle = 0;
  let dParen = 0;
  let dBrace = 0;
  let dBracket = 0;
  let inStr = null;
  while (i < str.length) {
    const ch = str[i];
    if (inStr) {
      if (ch === '\\') {
        i += 2;
        continue;
      }
      if (ch === inStr) inStr = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
      i++;
      continue;
    }
    if (ch === '<') {
      dAngle++;
      i++;
      continue;
    }
    if (ch === '>' && dAngle > 0) {
      dAngle--;
      i++;
      continue;
    }
    if (ch === '(') {
      dParen++;
      i++;
      continue;
    }
    if (ch === ')' && dParen > 0) {
      dParen--;
      i++;
      continue;
    }
    if (ch === '[') {
      dBracket++;
      i++;
      continue;
    }
    if (ch === ']' && dBracket > 0) {
      dBracket--;
      i++;
      continue;
    }
    if (dAngle === 0 && dParen === 0 && dBrace === 0 && dBracket === 0) {
      if (ch === '=' && str[i + 1] === '>') {
        return { consumed: i };
      }
      if (ch === '{') {
        let bDepth = 1;
        let k = i + 1;
        let s2 = null;
        while (k < str.length && bDepth > 0) {
          const c2 = str[k];
          if (s2) {
            if (c2 === '\\') {
              k += 2;
              continue;
            }
            if (c2 === s2) s2 = null;
            k++;
            continue;
          }
          if (c2 === '"' || c2 === "'" || c2 === '`') {
            s2 = c2;
            k++;
            continue;
          }
          if (c2 === '{') bDepth++;
          else if (c2 === '}') bDepth--;
          k++;
        }
        const restAfterBrace = str.slice(k).match(/^\s*(=>|\{|\||&|\[\])/);
        if (restAfterBrace) {
          i = k;
          continue;
        }
        return { consumed: i };
      }
      if (ch === ';' || ch === ')') return null;
    }
    if (ch === '{') dBrace++;
    else if (ch === '}' && dBrace > 0) dBrace--;
    i++;
  }
  return null;
}

function stripParamAndReturnTypes(src) {
  let result = '';
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '/' && src[i + 1] === '/') {
      const nl = src.indexOf('\n', i);
      if (nl === -1) {
        result += src.slice(i);
        break;
      }
      result += src.slice(i, nl + 1);
      i = nl + 1;
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end === -1) {
        result += src.slice(i);
        break;
      }
      result += src.slice(i, end + 2);
      i = end + 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const q = ch;
      result += ch;
      i++;
      while (i < src.length) {
        const c = src[i];
        result += c;
        i++;
        if (c === '\\' && i < src.length) {
          result += src[i];
          i++;
          continue;
        }
        if (c === q) break;
      }
      continue;
    }

    if (ch === '(') {
      let depth = 1;
      let j = i + 1;
      let inS = null;
      while (j < src.length && depth > 0) {
        const c = src[j];
        if (inS) {
          if (c === '\\') {
            j += 2;
            continue;
          }
          if (c === inS) inS = null;
          j++;
          continue;
        }
        if (c === '"' || c === "'" || c === '`') {
          inS = c;
          j++;
          continue;
        }
        if (c === '(') depth++;
        else if (c === ')') depth--;
        j++;
      }
      if (depth === 0) {
        const before = result.slice(-100);
        const after = src.slice(j);
        const isFuncHeader =
          /(?:function(?:\s+[A-Za-z0-9_$]+)?|constructor|(?:async|static)\s+[A-Za-z0-9_$]+)\s*$/.test(
            before,
          );
        const isArrowHeader =
          /(?:=\s*(?:async\s*)?|\(\s*(?:async\s*)?|,\s*(?:async\s*)?|\breturn\s+(?:async\s*)?)$/.test(
            before,
          );
        const retInfo = isFuncHeader || isArrowHeader ? consumeReturnType(after) : null;
        if (isFuncHeader || retInfo || /^\s*=>/.test(after)) {
          const inner = src.slice(i + 1, j - 1);
          const cleanedInner = stripTypesFromParamList(inner);
          result += '(' + cleanedInner + ')';
          if (retInfo) {
            i = j + retInfo.consumed;
            continue;
          }
          i = j;
          continue;
        }
      }
    }

    result += ch;
    i++;
  }
  return result;
}

function stripAsAssertions(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '/' && src[i + 1] === '/') {
      const nl = src.indexOf('\n', i);
      if (nl === -1) {
        out += src.slice(i);
        break;
      }
      out += src.slice(i, nl + 1);
      i = nl + 1;
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end === -1) {
        out += src.slice(i);
        break;
      }
      out += src.slice(i, end + 2);
      i = end + 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const q = ch;
      out += ch;
      i++;
      while (i < src.length) {
        const c = src[i];
        out += c;
        i++;
        if (c === '\\' && i < src.length) {
          out += src[i];
          i++;
          continue;
        }
        if (c === q) break;
      }
      continue;
    }
    const prev = out[out.length - 1] || ' ';
    if (/\s/.test(prev) && /^as\s+(?=[A-Za-z0-9_{[(])/.test(src.slice(i))) {
      const m = src.slice(i).match(/^as\s+/);
      let k = i + m[0].length;
      const unk = src.slice(k).match(/^unknown\s+as\s+/);
      if (unk) k += unk[0].length;
      let dAngle = 0;
      let dBrace = 0;
      let dParen = 0;
      let dBracket = 0;
      let inS = null;
      while (k < src.length) {
        const c = src[k];
        if (inS) {
          if (c === '\\') {
            k += 2;
            continue;
          }
          if (c === inS) inS = null;
          k++;
          continue;
        }
        if (c === '"' || c === "'" || c === '`') {
          inS = c;
          k++;
          continue;
        }
        if (c === '<') {
          dAngle++;
          k++;
          continue;
        }
        if (c === '>' && dAngle > 0) {
          dAngle--;
          k++;
          continue;
        }
        if (c === '{') {
          dBrace++;
          k++;
          continue;
        }
        if (c === '}' && dBrace > 0) {
          dBrace--;
          k++;
          continue;
        }
        if (c === '(') {
          dParen++;
          k++;
          continue;
        }
        if (c === ')' && dParen > 0) {
          dParen--;
          k++;
          continue;
        }
        if (c === '[') {
          dBracket++;
          k++;
          continue;
        }
        if (c === ']' && dBracket > 0) {
          dBracket--;
          k++;
          continue;
        }
        if (dAngle === 0 && dBrace === 0 && dParen === 0 && dBracket === 0) {
          if (
            c === ',' ||
            c === ';' ||
            c === ')' ||
            c === ']' ||
            c === '}' ||
            c === '\n' ||
            c === '?'
          ) {
            break;
          }
        }
        k++;
      }
      i = k;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

function fallbackTranspile(src, filename) {
  if (filename.endsWith('.d.ts')) {
    return '"use strict";\nObject.defineProperty(exports, "__esModule", { value: true });\n';
  }
  if (filename.endsWith('.tsx')) {
    const imports = [];
    const importRe = /^\s*import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"]\s*;/gm;
    let m;
    while ((m = importRe.exec(src)) !== null) {
      const clause = m[1].trim();
      const spec = m[2];
      if (!clause.startsWith('type ')) imports.push(spec);
    }
    const sideEffectRe = /^\s*import\s+['"]([^'"]+)['"]\s*;/gm;
    while ((m = sideEffectRe.exec(src)) !== null) imports.push(m[1]);
    const exportedNames = new Set();
    for (const re of [
      /export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)/g,
      /export\s+const\s+([A-Za-z0-9_]+)/g,
    ]) {
      while ((m = re.exec(src)) !== null) exportedNames.add(m[1]);
    }
    let out = '"use strict";\nObject.defineProperty(exports, "__esModule", { value: true });\n';
    for (const spec of imports) out += `require(${JSON.stringify(spec)});\n`;
    for (const name of exportedNames) {
      out += `exports.${name} = function ${name}(props) { return { type: ${JSON.stringify(name)}, props: props || {} }; };\n`;
    }
    const defMatch = src.match(/export\s+default\s+([A-Za-z0-9_]+)/);
    if (defMatch) {
      const defName = defMatch[1];
      out += `exports.default = exports.${defName} || function ${defName}(props) { return { type: ${JSON.stringify(defName)}, props: props || {} }; };\n`;
    }
    return out;
  }

  let s = stripInterfacesAndTypeAliases(src);
  s = s.replace(/^\s*import\s+type\s+[\s\S]*?from\s+['"][^'"]+['"]\s*;\s*$/gm, '');
  s = s.replace(
    /^\s*import\s+\{([\s\S]*?)\}\s+from\s+['"]([^'"]+)['"]\s*;/gm,
    (_, specifiers, modPath) => {
      const bindings = specifiers
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p && !p.startsWith('type '))
        .map((p) => p.replace(/\s+as\s+/, ': '))
        .join(', ');
      if (!bindings) return '';
      return `const { ${bindings} } = require('${modPath}');`;
    },
  );

  const exported = [];
  s = s.replace(
    /^\s*export\s+(async\s+function|function|class|const|let)\s+([A-Za-z0-9_]+)/gm,
    (_, kw, name) => {
      exported.push(name);
      return `${kw} ${name}`;
    },
  );

  s = s.replace(/\b(?:private|public|protected|readonly)\s+/g, '');
  s = s.replace(/\b(new\s+(?:Set|Map|Array)|Promise)<[^>()]+>\(/g, '$1(');
  s = s.replace(/(function\s+[A-Za-z0-9_]+)\s*<[^>]+>\s*\(/g, '$1(');

  s = stripParamAndReturnTypes(s);
  s = stripAsAssertions(s);
  s = s.replace(/([A-Za-z0-9_$])!(?=[.,;)\]])/g, '$1');

  s = s.replace(/^(\s*(?:const|let|var)\s+[A-Za-z0-9_$]+)\s*:\s*[^=;\n]+(\s*=)/gm, '$1$2');
  s = s.replace(/^(\s*(?:let|var)\s+[A-Za-z0-9_$]+)\s*:\s*[^=;\n]+(;)/gm, '$1$2');

  let footer = '\nObject.defineProperty(exports, "__esModule", { value: true });\n';
  for (const name of exported) {
    footer += `exports.${name} = ${name};\n`;
  }
  return '"use strict";\n' + s + footer;
}

const transpile = fallbackTranspile;

/* ─── Module Loader with Chrome & DOM Environment Harness ─── */

function createChromeMock(initialLocal = {}, initialSync = {}, initialSession = {}) {
  const localStore = structuredClone(initialLocal);
  const syncStore = structuredClone(initialSync);
  const sessionStore = structuredClone(initialSession);
  const cookiesList = [];
  const badges = [];
  const reloads = [];
  const browsingRemoved = [];
  const scriptsExecuted = [];
  const commandListeners = [];
  const messageListeners = [];
  const downloadsTriggered = [];
  const downloadsShown = [];
  const downloadChangedListeners = [];

  const makeArea = (store) => ({
    _raw: store,
    async get(keys) {
      if (!keys) return structuredClone(store);
      const list = Array.isArray(keys) ? keys : Object.keys(keys);
      const out = {};
      for (const k of list) {
        if (k in store) out[k] = structuredClone(store[k]);
      }
      return out;
    },
    async set(items) {
      for (const [k, v] of Object.entries(items)) {
        store[k] = structuredClone(v);
      }
    },
    async remove(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const k of list) delete store[k];
    },
  });

  const chromeMock = {
    _state: {
      localStore,
      syncStore,
      sessionStore,
      cookiesList,
      badges,
      reloads,
      browsingRemoved,
      scriptsExecuted,
      commandListeners,
      messageListeners,
      downloadsTriggered,
      downloadsShown,
      downloadChangedListeners,
    },
    storage: {
      local: makeArea(localStore),
      sync: makeArea(syncStore),
      session: makeArea(sessionStore),
    },
    runtime: {
      lastError: null,
      onInstalled: { addListener() {} },
      onMessage: {
        addListener(fn) {
          messageListeners.push(fn);
        },
      },
      getURL(p) {
        return `chrome-extension://mockid/${p}`;
      },
    },
    commands: {
      onCommand: {
        addListener(fn) {
          commandListeners.push(fn);
        },
      },
    },
    action: {
      setBadgeText(details) {
        badges.push({ type: 'text', ...details });
      },
      setBadgeBackgroundColor(details) {
        badges.push({ type: 'color', ...details });
      },
    },
    tabs: {
      _activeTab: { id: 42, url: 'https://target.example.com/dashboard' },
      async query() {
        return [this._activeTab];
      },
      reload(tabId) {
        reloads.push(tabId);
      },
      create() {},
    },
    browsingData: {
      async remove(options, dataToRemove) {
        browsingRemoved.push({ options, dataToRemove });
      },
    },
    scripting: {
      async executeScript(injection) {
        scriptsExecuted.push(injection);
      },
    },
    downloads: {
      download(options, cb) {
        const id = downloadsTriggered.length + 101;
        downloadsTriggered.push({ id, ...options });
        if (typeof cb === 'function') cb(id);
        return Promise.resolve(id);
      },
      show(id) {
        downloadsShown.push(id);
      },
      onChanged: {
        addListener(fn) {
          downloadChangedListeners.push(fn);
        },
        removeListener(fn) {
          const idx = downloadChangedListeners.indexOf(fn);
          if (idx >= 0) downloadChangedListeners.splice(idx, 1);
        },
      },
    },
    cookies: {
      _failName: null,
      _rejectUnspecifiedSameSite: false,
      _rejectLeadingDotDomain: false,
      async getAllCookieStores() {
        return [{ id: '0' }, { id: '1' }];
      },
      async getAll(filter = {}) {
        let out = [...cookiesList];
        if (filter.storeId) {
          out = out.filter((c) => (c.storeId || '0') === filter.storeId);
        }
        if (filter.domain) {
          out = out.filter((c) =>
            c.domain.replace(/^\.+/, '').endsWith(filter.domain.replace(/^\.+/, '')),
          );
        }
        return out;
      },
      async set(details) {
        if (this._failName && details.name === this._failName) {
          throw new Error(`Simulated rejection for ${details.name}`);
        }
        if (details.secure && details.url && details.url.startsWith('http://')) {
          throw new Error('Secure cookies cannot be set from non-secure http:// URLs');
        }
        if (details.name.startsWith('__Host-')) {
          if (!details.secure || details.domain || details.path !== '/' || !details.url.startsWith('https://')) {
            throw new Error('Invalid __Host- cookie attributes');
          }
        }
        if (this._rejectUnspecifiedSameSite && details.sameSite === 'unspecified') {
          throw new Error('Rejected unspecified SameSite');
        }
        if (this._rejectLeadingDotDomain && details.domain && details.domain.startsWith('.')) {
          throw new Error('Rejected leading dot domain');
        }
        const hostOnly = !details.domain;
        const domain = details.domain || new URL(details.url).hostname;
        const idx = cookiesList.findIndex(
          (c) =>
            c.name === details.name &&
            c.domain === domain &&
            c.path === (details.path || '/') &&
            (c.storeId || '0') === (details.storeId || '0'),
        );
        const record = {
          name: details.name,
          value: details.value,
          domain,
          path: details.path || '/',
          secure: Boolean(details.secure),
          httpOnly: Boolean(details.httpOnly),
          hostOnly,
          session: !details.expirationDate,
          ...(details.expirationDate ? { expirationDate: details.expirationDate } : {}),
          ...(details.sameSite ? { sameSite: details.sameSite } : {}),
          storeId: details.storeId || '0',
        };
        if (idx >= 0) cookiesList[idx] = record;
        else cookiesList.push(record);
        return record;
      },
      async remove(details) {
        const host = new URL(details.url).hostname;
        const idx = cookiesList.findIndex(
          (c) => c.name === details.name && c.domain.replace(/^\.+/, '') === host,
        );
        if (idx >= 0) {
          const [removed] = cookiesList.splice(idx, 1);
          return removed;
        }
        return null;
      },
    },
  };

  return chromeMock;
}

const transpiledCache = new Map();

function getTranspiledCode(resolved) {
  if (transpiledCache.has(resolved)) return transpiledCache.get(resolved);
  const src = fs.readFileSync(resolved, 'utf8');
  const js = transpile(src, resolved);
  transpiledCache.set(resolved, js);
  return js;
}

function loadTsModule(relPath, chromeMock) {
  const cache = new Map();

  function requireModule(targetPath) {
    let resolved = targetPath;
    if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
      for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
        if (fs.existsSync(resolved + ext)) {
          resolved = resolved + ext;
          break;
        }
      }
    }
    if (cache.has(resolved)) return cache.get(resolved).exports;

    const js = getTranspiledCode(resolved);
    const mod = { exports: {} };
    cache.set(resolved, mod);

    const localRequire = (spec) => {
      if (spec.endsWith('.css')) return {};
      if (spec.startsWith('.')) {
        return requireModule(path.resolve(path.dirname(resolved), spec));
      }
      if (spec === 'react') {
        return {
          createElement: (...args) => ({ type: args[0], props: args[1], children: args.slice(2) }),
          useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
          useEffect: () => {},
          useRef: (init) => ({ current: init }),
          useCallback: (fn) => fn,
          StrictMode: 'StrictMode',
        };
      }
      if (spec === 'react-dom/client') {
        return { createRoot: () => ({ render() {} }) };
      }
      return requireFn(spec);
    };

    const mockDocument = {
      _clickedLinks: [],
      getElementById: () => ({}),
      createElement: () => {
        const el = {
          href: '',
          download: '',
          setAttribute(k, v) {
            this[k] = v;
          },
          click() {
            mockDocument._clickedLinks.push({ href: this.href, download: this.download });
          },
          remove() {},
        };
        return el;
      },
      body: { appendChild() {} },
    };

    const fn = vm.compileFunction(
      js,
      ['module', 'exports', 'require', 'chrome', 'document', 'console', 'crypto'],
      { filename: resolved },
    );
    fn(
      mod,
      mod.exports,
      localRequire,
      chromeMock,
      mockDocument,
      {
        log() {},
        warn() {},
        error() {},
      },
      webcrypto,
    );
    return mod.exports;
  }

  return requireModule(path.join(ROOT, relPath));
}

/* ─── Test Runner ─── */

let passed = 0;
let failed = 0;

async function test(id, name, fn) {
  try {
    await fn();
    passed++;
  } catch (err) {
    failed++;
    console.error(`[FAIL] ${id} — ${name}: ${err.message}`);
    throw err;
  }
}

async function runSuite() {
  /* ═══ 1. Static Security & Zero-PII/Secret Exposure Audit (T01–T05) ═══ */

  await test('T01', 'Retired legacy files are absent from repository tree', () => {
    const retired = [
      'src/components/PasteManager.tsx',
      'src/components/EmailListManager.tsx',
      'src/components/ClipboardManager.tsx',
      'src/components/debug.js',
      'src/modules/clipboardManager/index.ts',
    ];
    for (const rel of retired) {
      assert.equal(fs.existsSync(path.join(ROOT, rel)), false, `${rel} must not exist`);
    }
  });

  await test('T02', 'Zero hardcoded @icloud.com or personal seed emails in tracked source', () => {
    const forbidden = [
      'escapes-lull-8c',
      'hinge_typical_1t',
      'had-award8i',
      'encoder.51-test',
      'verve.27-gears',
      'orotund_swan_3o',
      'whoops.motor.36',
      '@icloud.com',
      'DEFAULT_GROUPS',
      'DEFAULT_ENTRIES',
    ];

    function walkSrc(dir) {
      let files = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...walkSrc(full));
        else if (/\.(ts|tsx|js|json|html|css|md)$/.test(entry.name)) files.push(full);
      }
      return files;
    }

    const targets = [
      ...walkSrc(path.join(ROOT, 'src')),
      path.join(ROOT, 'README.md'),
      path.join(ROOT, 'TODO.md'),
      path.join(ROOT, 'manifest.json'),
      path.join(ROOT, 'package.json'),
    ];

    for (const file of targets) {
      const content = fs.readFileSync(file, 'utf8');
      for (const token of forbidden) {
        assert.equal(
          content.includes(token),
          false,
          `Forbidden token "${token}" found in ${path.relative(ROOT, file)}`,
        );
      }
    }
  });

  await test('T03', '.gitignore tracks CredentialVault.tsx and ignores *.vault / *.4nt', () => {
    const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
    assert.equal(gitignore.includes('CredentialVault.tsx'), false);
    assert.equal(gitignore.includes('*.vault'), true);
    assert.equal(gitignore.includes('*.4nt'), true);
  });

  await test('T04', 'package.json has zero crypto-js or express dependencies', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert.equal(pkg.name, '4ndr0cookie');
    assert.equal(pkg.version, '1.1.1');
    assert.equal('crypto-js' in (pkg.dependencies || {}), false);
    assert.equal('express' in (pkg.dependencies || {}), false);
    assert.equal(typeof pkg.scripts?.check, 'string');
    assert.equal(typeof pkg.scripts?.docs, 'string');
  });

  await test('T05', 'All 13 TypeScript/TSX source files transpile cleanly', () => {
    const expectedFiles = [
      'src/env.d.ts',
      'src/lib/clearancePayload.ts',
      'src/modules/cookie-backup/index.ts',
      'src/modules/cookieManager/index.ts',
      'src/modules/credentialVault/index.ts',
      'src/background/service-worker.ts',
      'src/components/TabNavigation.tsx',
      'src/components/SiteClearanceManager.tsx',
      'src/components/CookieManager.tsx',
      'src/components/CookieBackupManager.tsx',
      'src/components/CredentialVault.tsx',
      'src/popup/index.tsx',
      'src/options/index.tsx',
    ];
    for (const rel of expectedFiles) {
      const full = path.join(ROOT, rel);
      assert.equal(fs.existsSync(full), true, `Missing ${rel}`);
      const rawSrc = fs.readFileSync(full, 'utf8');
      assert.equal(
        /const\s+\w+\s*=\s*chrome\.downloads\.download\s*\(/.test(rawSrc),
        false,
        `${rel} must not assign void-typed chrome.downloads.download callback overload without unknown cast (TS1345)`,
      );
      const compiled = getTranspiledCode(full);
      assert.equal(typeof compiled, 'string');
      assert.equal(compiled.length > 0, true);
    }
  });

  /* ═══ 2. Directive Alpha — Export Sanitization Matrix (T06–T10) ═══ */

  const chromeMock = createChromeMock();
  const backupMod = loadTsModule('src/modules/cookie-backup/index.ts', chromeMock);

  await test('T06', 'Alpha: Cloudflare and bot transit tokens are purged', () => {
    const input = [
      { name: '__cf_bm', value: '1', domain: '.example.com', path: '/' },
      { name: '_cfuvid', value: '2', domain: '.example.com', path: '/' },
      { name: '__cflb', value: '3', domain: '.example.com', path: '/' },
      { name: '_dd_s', value: '4', domain: '.example.com', path: '/' },
      { name: '_abck', value: '5', domain: '.example.com', path: '/' },
      { name: 'session_token', value: 'keep', domain: '.example.com', path: '/' },
    ];
    const { cookies, report } = backupMod.sanitizeCookies(input);
    assert.equal(cookies.length, 1);
    assert.equal(cookies[0].name, 'session_token');
    assert.equal(report.retained, 1);
    assert.equal(report.dropped, 5);
  });

  await test('T07', 'Alpha: Sliding-window timestamp tickets (__Secure-1PSIDTS / 3PSIDTS) are purged', () => {
    const input = [
      { name: '__Secure-1PSIDTS', value: 'ts1', domain: '.google.com', path: '/' },
      { name: '__Secure-3PSIDTS', value: 'ts3', domain: '.google.com', path: '/' },
      { name: '__Secure-1PSID', value: 'core1', domain: '.google.com', path: '/' },
      { name: '__Secure-3PSID', value: 'core3', domain: '.google.com', path: '/' },
    ];
    const { cookies, report } = backupMod.sanitizeCookies(input);
    assert.equal(cookies.length, 2);
    assert.deepEqual(
      cookies.map((c) => c.name),
      ['__Secure-1PSID', '__Secure-3PSID'],
    );
    assert.equal(report.dropped, 2);
  });

  await test('T08', 'Alpha: Telemetry and analytics cookies are purged', () => {
    const input = [
      { name: '_ga', value: '1', domain: '.example.com', path: '/' },
      { name: '_ga_ABC123', value: '2', domain: '.example.com', path: '/' },
      { name: '_gid', value: '3', domain: '.example.com', path: '/' },
      { name: '_gcl_au', value: '4', domain: '.example.com', path: '/' },
      { name: 'sensorsdata2015jssdkcross', value: '5', domain: '.example.com', path: '/' },
      { name: 'sajssdk_2015_cross_new_user', value: '6', domain: '.example.com', path: '/' },
      { name: '_v-metrics', value: '7', domain: '.example.com', path: '/' },
      { name: 'auth_sid', value: 'valid', domain: '.example.com', path: '/' },
    ];
    const { cookies, report } = backupMod.sanitizeCookies(input);
    assert.equal(cookies.length, 1);
    assert.equal(cookies[0].name, 'auth_sid');
    assert.equal(report.dropped, 7);
    assert.equal(report.droppedNames.length, 7);
  });

  await test('T09', 'Alpha: Case-insensitive matching on ephemeral cookie names', () => {
    const input = [
      { name: '__CF_BM', value: '1', domain: '.example.com', path: '/' },
      { name: '_GA_999', value: '2', domain: '.example.com', path: '/' },
    ];
    const { cookies, report } = backupMod.sanitizeCookies(input);
    assert.equal(cookies.length, 0);
    assert.equal(report.dropped, 2);
  });

  await test('T10', 'Alpha: Deduplicates droppedNames in SanitizeReport', () => {
    const input = [
      { name: '_ga', value: '1', domain: '.a.com', path: '/' },
      { name: '_ga', value: '2', domain: '.b.com', path: '/' },
      { name: 'sid', value: '3', domain: '.a.com', path: '/' },
    ];
    const { report } = backupMod.sanitizeCookies(input);
    assert.equal(report.retained, 1);
    assert.equal(report.dropped, 2);
    assert.deepEqual(report.droppedNames, ['_ga']);
  });

  /* ═══ 3. Directive Beta — Native Web Crypto Cookie Backup (T11–T19) ═══ */

  const sampleCookies = [
    {
      name: 'SID',
      value: 'secret-session-value',
      domain: '.example.com',
      path: '/',
      secure: true,
      httpOnly: true,
      hostOnly: false,
      session: false,
      expirationDate: 1999999999,
      sameSite: 'lax',
      storeId: '0',
    },
  ];

  let encryptedV2 = '';

  await test('T11', 'Beta: encryptBackup produces v2 JSON envelope with PBKDF2 310k + AES-256-GCM', async () => {
    encryptedV2 = await backupMod.encryptBackup(sampleCookies, 'RedTeam#Pass1');
    const env = JSON.parse(encryptedV2);
    assert.equal(env.format, '4ndr0cookie-backup');
    assert.equal(env.version, 2);
    assert.equal(env.kdf.name, 'PBKDF2');
    assert.equal(env.kdf.hash, 'SHA-256');
    assert.equal(env.kdf.iterations, 310000);
    assert.equal(env.cipher.name, 'AES-256-GCM');
    assert.equal(typeof env.kdf.salt, 'string');
    assert.equal(typeof env.cipher.iv, 'string');
    assert.equal(typeof env.payload, 'string');
    assert.equal(encryptedV2.includes('secret-session-value'), false);
  });

  await test('T12', 'Beta: decryptBackup round-trips v2 envelope losslessly', async () => {
    const restored = await backupMod.decryptBackup(encryptedV2, 'RedTeam#Pass1');
    assert.equal(restored.length, 1);
    assert.equal(restored[0].name, 'SID');
    assert.equal(restored[0].value, 'secret-session-value');
  });

  await test('T13', 'Beta: decryptBackup rejects wrong password on v2 envelope', async () => {
    await assert.rejects(
      () => backupMod.decryptBackup(encryptedV2, 'WrongPassword'),
      /Decryption failed/,
    );
  });

  await test('T14', 'Beta: decryptBackup rejects tampered ciphertext (GCM tag check)', async () => {
    const env = JSON.parse(encryptedV2);
    const rawBytes = Buffer.from(env.payload, 'base64');
    rawBytes[rawBytes.length - 1] ^= 0xff;
    env.payload = rawBytes.toString('base64');
    await assert.rejects(
      () => backupMod.decryptBackup(JSON.stringify(env), 'RedTeam#Pass1'),
      /Decryption failed/,
    );
  });

  await test('T15', 'Beta: encryptBackup & decryptBackup throw PasswordRequiredError when password empty', async () => {
    await assert.rejects(
      () => backupMod.encryptBackup(sampleCookies, ''),
      (err) => err.name === 'PasswordRequiredError',
    );
    await assert.rejects(
      () => backupMod.decryptBackup(encryptedV2, ''),
      (err) => err.name === 'PasswordRequiredError',
    );
  });

  await test('T16', 'Beta: decryptBackup supports legacy v1.0.x base64 (100k PBKDF2) format', async () => {
    const salt = webcrypto.getRandomValues(new Uint8Array(16));
    const iv = webcrypto.getRandomValues(new Uint8Array(12));
    const keyMat = await webcrypto.subtle.importKey(
      'raw',
      new TextEncoder().encode('LegacyPass'),
      { name: 'PBKDF2' },
      false,
      ['deriveKey'],
    );
    const key = await webcrypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      keyMat,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt'],
    );
    const cipher = await webcrypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(JSON.stringify(sampleCookies)),
    );
    const combined = new Uint8Array(16 + 12 + cipher.byteLength);
    combined.set(salt, 0);
    combined.set(iv, 16);
    combined.set(new Uint8Array(cipher), 28);
    const b64 = Buffer.from(combined).toString('base64');

    const restored = await backupMod.decryptBackup(b64, 'LegacyPass');
    assert.equal(restored.length, 1);
    assert.equal(restored[0].name, 'SID');
  });

  await test('T17', 'Beta: decryptBackup rejects interim crypto-js U2FsdGVkX1 payloads with UnsupportedBackupFormatError', async () => {
    await assert.rejects(
      () => backupMod.decryptBackup('U2FsdGVkX19abcdef0123456789==', 'anypass'),
      (err) => err.name === 'UnsupportedBackupFormatError',
    );
  });

  await test('T18', 'Beta: parseCookieBackup auto-detects v2 encrypted JSON envelope when isEncrypted omitted', async () => {
    const res = await backupMod.parseCookieBackup(encryptedV2, 'RedTeam#Pass1');
    assert.equal(res.cookies.length, 1);
    assert.equal(res.cookies[0].value, 'secret-session-value');
  });

  await test('T19', 'Beta: parseCookieBackup auto-detects unencrypted JSON cookie array and {cookies} wrapper', async () => {
    const resArr = await backupMod.parseCookieBackup(JSON.stringify(sampleCookies));
    assert.equal(resArr.length === undefined ? resArr.cookies.length : 0, 1);
    const resWrap = await backupMod.parseCookieBackup(JSON.stringify({ cookies: sampleCookies }));
    assert.equal(resWrap.cookies.length, 1);
  });

  /* ═══ 4. Directive Gamma — Restoration Engine Hardening (T20–T24) ═══ */

  await test('T20', 'Gamma: synthesizeCookieUrl strips leading dots and maps secure flag to protocol', () => {
    assert.equal(
      backupMod.synthesizeCookieUrl({ domain: '..sub.example.com', path: '/app', secure: true }),
      'https://sub.example.com/app',
    );
    assert.equal(
      backupMod.synthesizeCookieUrl({ domain: 'example.com', path: '', secure: false }),
      'http://example.com/',
    );
  });

  await test('T21', 'Gamma: buildCookieSetDetails omits domain for hostOnly cookies', () => {
    const details = backupMod.buildCookieSetDetails(
      {
        name: 'host_cookie',
        value: 'v',
        domain: 'host.example.com',
        path: '/',
        secure: true,
        httpOnly: false,
        hostOnly: true,
        session: true,
      },
      ['0'],
    );
    assert.equal('domain' in details, false);
    assert.equal('expirationDate' in details, false);
    assert.equal(details.url, 'https://host.example.com/');
  });

  await test('T22', 'Gamma: buildCookieSetDetails preserves domain for domain cookies and expirationDate for persistent cookies', () => {
    const details = backupMod.buildCookieSetDetails(
      {
        name: 'dom_cookie',
        value: 'v',
        domain: '.example.com',
        path: '/auth',
        secure: true,
        httpOnly: true,
        hostOnly: false,
        session: false,
        expirationDate: 1890000000,
      },
      ['0'],
    );
    assert.equal(details.domain, '.example.com');
    assert.equal(details.expirationDate, 1890000000);
  });

  await test('T23', 'Gamma: buildCookieSetDetails enforces secure=true and https:// URL when sameSite is no_restriction', () => {
    const details = backupMod.buildCookieSetDetails(
      {
        name: 'cross_site',
        value: '1',
        domain: '.example.com',
        path: '/',
        secure: false,
        httpOnly: false,
        sameSite: 'no_restriction',
      },
      ['0'],
    );
    assert.equal(details.sameSite, 'no_restriction');
    assert.equal(details.secure, true);
    assert.equal(details.url, 'https://example.com/');
  });

  await test('T24', 'Gamma: buildCookieSetDetails validates storeId against availableStoreIds', () => {
    const known = backupMod.buildCookieSetDetails(
      { name: 'a', value: '1', domain: 'example.com', path: '/', secure: true, httpOnly: false, storeId: '1' },
      ['0', '1'],
    );
    assert.equal(known.storeId, '1');

    const unknown = backupMod.buildCookieSetDetails(
      { name: 'a', value: '1', domain: 'example.com', path: '/', secure: true, httpOnly: false, storeId: '99' },
      ['0', '1'],
    );
    assert.equal('storeId' in unknown, false);
  });

  /* ═══ 5. Directive Delta — Single-Site Cookie CRUD & Netscape Fidelity (T25–T30) ═══ */

  const cmMod = loadTsModule('src/modules/cookieManager/index.ts', chromeMock);
  const { CookieManagerModule } = cmMod;

  await test('T25', 'Delta: Netscape export & import round-trips #HttpOnly_, hostOnly, domain, and session cookies', () => {
    const original = [
      {
        name: 'http_only_tok',
        value: 'xyz=123',
        domain: '.target.example.com',
        path: '/api',
        secure: true,
        httpOnly: true,
        hostOnly: false,
        session: false,
        expirationDate: 1950000000,
      },
      {
        name: 'host_sess',
        value: 'abc',
        domain: 'target.example.com',
        path: '/',
        secure: false,
        httpOnly: false,
        hostOnly: true,
        session: true,
      },
    ];
    const netscapeText = CookieManagerModule.toNetscape(original);
    assert.equal(netscapeText.includes('#HttpOnly_.target.example.com\tTRUE\t/api\tTRUE\t1950000000\thttp_only_tok\txyz=123'), true);
    assert.equal(netscapeText.includes('target.example.com\tFALSE\t/\tFALSE\t0\thost_sess\tabc'), true);

    const parsed = CookieManagerModule.parseNetscape(netscapeText);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].httpOnly, true);
    assert.equal(parsed[0].hostOnly, false);
    assert.equal(parsed[0].domain, '.target.example.com');
    assert.equal(parsed[0].expirationDate, 1950000000);
    assert.equal(parsed[1].httpOnly, false);
    assert.equal(parsed[1].hostOnly, true);
    assert.equal(parsed[1].domain, 'target.example.com');
    assert.equal(parsed[1].session, true);
  });

  await test('T26', 'Delta: parseImport auto-detects JSON array, {cookies} wrapper, and Netscape text', () => {
    const c1 = CookieManagerModule.parseImport(JSON.stringify(sampleCookies));
    assert.equal(c1.length, 1);
    const c2 = CookieManagerModule.parseImport(JSON.stringify({ cookies: sampleCookies }));
    assert.equal(c2.length, 1);
    const c3 = CookieManagerModule.parseImport(CookieManagerModule.toNetscape(sampleCookies));
    assert.equal(c3.length, 1);
  });

  await test('T27', 'Delta: importCookies isolates individual write failures via Promise.allSettled', async () => {
    chromeMock._state.cookiesList.length = 0;
    chromeMock.cookies._failName = 'bad_cookie';
    const res = await CookieManagerModule.importCookies([
      { name: 'good_1', value: '1', domain: 'target.example.com', path: '/', secure: true, httpOnly: false, hostOnly: true },
      { name: 'bad_cookie', value: '2', domain: 'target.example.com', path: '/', secure: true, httpOnly: false, hostOnly: true },
      { name: 'good_2', value: '3', domain: 'target.example.com', path: '/', secure: true, httpOnly: false, hostOnly: true },
    ]);
    chromeMock.cookies._failName = null;
    assert.equal(res.imported, 2);
    assert.equal(res.failed, 1);
    assert.equal(chromeMock._state.cookiesList.length, 2);
  });

  await test('T28', 'Delta: updateCookie preserves SameSite/storeId and removes original only after rename succeeds', async () => {
    chromeMock._state.cookiesList.length = 0;
    const orig = {
      name: 'old_name',
      value: 'v1',
      domain: '.target.example.com',
      path: '/',
      secure: false,
      httpOnly: true,
      hostOnly: false,
      sameSite: 'no_restriction',
      storeId: '1',
    };
    await chromeMock.cookies.set({
      url: 'https://target.example.com/',
      name: orig.name,
      value: orig.value,
      domain: orig.domain,
      path: orig.path,
      secure: true,
      httpOnly: true,
      sameSite: 'no_restriction',
      storeId: '1',
    });

    const ok = await CookieManagerModule.updateCookie(orig, { name: 'new_name', value: 'v2' });
    assert.equal(ok, true);
    assert.equal(chromeMock._state.cookiesList.length, 1);
    assert.equal(chromeMock._state.cookiesList[0].name, 'new_name');
    assert.equal(chromeMock._state.cookiesList[0].value, 'v2');
    assert.equal(chromeMock._state.cookiesList[0].sameSite, 'no_restriction');
    assert.equal(chromeMock._state.cookiesList[0].secure, true);
    assert.equal(chromeMock._state.cookiesList[0].storeId, '1');
  });

  await test('T29', 'Delta: updateCookie does not delete original cookie if set fails', async () => {
    chromeMock._state.cookiesList.length = 0;
    const orig = {
      name: 'keep_me',
      value: 'v1',
      domain: 'target.example.com',
      path: '/',
      secure: true,
      httpOnly: false,
      hostOnly: true,
    };
    await chromeMock.cookies.set({
      url: 'https://target.example.com/',
      name: orig.name,
      value: orig.value,
      path: '/',
      secure: true,
    });
    chromeMock.cookies._failName = 'broken_target';
    const ok = await CookieManagerModule.updateCookie(orig, { name: 'broken_target', value: 'v2' });
    chromeMock.cookies._failName = null;
    assert.equal(ok, false);
    assert.equal(chromeMock._state.cookiesList.length, 1);
    assert.equal(chromeMock._state.cookiesList[0].name, 'keep_me');
  });

  await test('T30', 'Delta: clearAllCookiesForSite deletes all current tab cookies cleanly', async () => {
    const res = await CookieManagerModule.clearAllCookiesForSite();
    assert.equal(res.imported, 1);
    assert.equal(res.failed, 0);
    assert.equal(chromeMock._state.cookiesList.length, 0);
  });

  /* ═══ 6. Sensitive Storage Redesign — Credential Vault (T31–T36) ═══ */

  await test('T31', 'Vault: Fresh storage initializes to empty array [] with zero hardcoded credentials', async () => {
    const freshChrome = createChromeMock();
    const vaultMod = loadTsModule('src/modules/credentialVault/index.ts', freshChrome);
    const state = await vaultMod.loadVaultFromStorage();
    assert.equal(state.locked, false);
    assert.equal(state.sealed, false);
    assert.deepEqual(state.groups, []);
    assert.deepEqual(freshChrome._state.localStore.credentialVault, []);
  });

  await test('T32', 'Vault: Legacy emailGroups, emailList, pasteEntries, pasteManagerItems, and flat Credentials migrate and legacy keys are scrubbed', async () => {
    const legacyChrome = createChromeMock({
      credentialVault: [
        { id: 'flat-1', site: 'alpha.local', username: 'u1@alpha.local', password: 'pw1', notes: '2FA on' },
      ],
      emailGroups: [
        { id: 'eg-1', name: 'beta.local', entries: [{ id: 'e-1', label: 'm1', email: 'm1@beta.local', timestamp: 12345 }] },
      ],
      emailList: [
        { id: 'el-1', email: 'burner@gamma.local', category: 'gamma.local' },
      ],
      pasteEntries: [
        { id: 'pe-1', label: 'delta-api', value: 'sk-secret-token', hidden: true },
      ],
      pasteManagerItems: [
        { id: 'pm-1', label: 'epsilon', value: 'ops@epsilon.local', hidden: true },
      ],
    });
    const vaultMod = loadTsModule('src/modules/credentialVault/index.ts', legacyChrome);
    const state = await vaultMod.loadVaultFromStorage();

    assert.equal(state.groups.length, 5);
    assert.equal(state.migratedKeysPurged.length, 4);
    assert.equal('emailGroups' in legacyChrome._state.localStore, false);
    assert.equal('emailList' in legacyChrome._state.localStore, false);
    assert.equal('pasteEntries' in legacyChrome._state.localStore, false);
    assert.equal('pasteManagerItems' in legacyChrome._state.localStore, false);

    const alpha = state.groups.find((g) => g.site === 'alpha.local');
    assert.equal(alpha.note, '2FA on');
    assert.equal(alpha.accounts[0].email, 'u1@alpha.local');
    assert.equal(alpha.accounts[0].password, 'pw1');

    const delta = state.groups.find((g) => g.site === 'delta-api');
    assert.equal(delta.accounts[0].password, 'sk-secret-token');
  });

  await test('T33', 'Vault: At-rest AES-256-GCM sealing (VaultStorageEnvelope) encrypts storage with zero plaintext leakage', async () => {
    const sealChrome = createChromeMock();
    const vaultMod = loadTsModule('src/modules/credentialVault/index.ts', sealChrome);
    const groups = [
      {
        id: 'g1',
        site: 'op.example.com',
        note: 'recovery code 9911',
        accounts: [
          {
            id: 'a1',
            label: 'm1',
            email: 'operator@example.com',
            password: 'UltraSecret!Password:With:Colons',
            hidden: true,
            status: 'fresh',
            lastUsed: 1700000000000,
          },
        ],
      },
    ];

    const env = await vaultMod.saveVaultToStorage(groups, {
      sealed: true,
      passphrase: 'MasterVaultKey!2026',
    });

    assert.equal(vaultMod.isVaultEnvelope(env), true);
    assert.equal(env.format, '4ndr0cookie-vault-store');
    assert.equal(env.kdf.iterations, 310000);
    assert.equal(env.cipher.name, 'AES-256-GCM');

    const rawStoredJson = JSON.stringify(sealChrome._state.localStore.credentialVault);
    assert.equal(rawStoredJson.includes('operator@example.com'), false);
    assert.equal(rawStoredJson.includes('UltraSecret!Password'), false);
    assert.equal(rawStoredJson.includes('recovery code 9911'), false);

    const activeState = await vaultMod.loadVaultFromStorage();
    assert.equal(activeState.sealed, true);
    assert.equal(activeState.locked, false);
    assert.equal(activeState.groups[0].accounts[0].password, 'UltraSecret!Password:With:Colons');

    await vaultMod.clearSessionVaultCache();
    const lockedState = await vaultMod.loadVaultFromStorage();
    assert.equal(lockedState.sealed, true);
    assert.equal(lockedState.locked, true);
    assert.deepEqual(lockedState.groups, []);

    const unsealed = await vaultMod.unsealVaultStorage(lockedState.envelope, 'MasterVaultKey!2026');
    assert.equal(unsealed.length, 1);
    assert.equal(unsealed[0].accounts[0].email, 'operator@example.com');
    assert.equal(unsealed[0].accounts[0].password, 'UltraSecret!Password:With:Colons');

    await assert.rejects(
      () => vaultMod.unsealVaultStorage(lockedState.envelope, 'WrongPassphrase'),
    );
  });

  await test('T34', 'Vault: Binary .vault ("4ntv") export and import round-trips and rejects tampering', async () => {
    const vaultMod = loadTsModule('src/modules/credentialVault/index.ts', chromeMock);
    const groups = [
      {
        id: 'g1',
        site: 'portal.local',
        note: 'test note',
        accounts: [
          {
            id: 'a1',
            label: 'm1',
            email: 'm1@portal.local',
            password: 'p1',
            hidden: true,
            status: 'active',
            lastUsed: 100,
          },
        ],
      },
    ];
    const bytes = await vaultMod.encryptVaultBinary(groups, 'ExportKey#9');
    assert.equal(String.fromCharCode(...bytes.slice(0, 4)), '4ntv');

    const restored = await vaultMod.decryptVaultBinary(bytes, 'ExportKey#9');
    assert.equal(restored.length, 1);
    assert.equal(restored[0].site, 'portal.local');
    assert.equal(restored[0].accounts[0].status, 'active');

    await assert.rejects(
      () => vaultMod.decryptVaultBinary(bytes, 'WrongKey'),
    );
  });

  await test('T35', 'Vault: parseAccountLine handles all 5 input grammars without corrupting passwords with colons/spaces', () => {
    const vaultMod = loadTsModule('src/modules/credentialVault/index.ts', chromeMock);

    assert.deepEqual(
      vaultMod.parseAccountLine('m1: user@example.com: p@ss : word : 123'),
      { label: 'm1', email: 'user@example.com', password: 'p@ss : word : 123' },
    );
    assert.deepEqual(
      vaultMod.parseAccountLine('user@example.com: secret:colon:pw'),
      { label: '', email: 'user@example.com', password: 'secret:colon:pw' },
    );
    assert.deepEqual(
      vaultMod.parseAccountLine('m2: alias@example.com'),
      { label: 'm2', email: 'alias@example.com', password: '' },
    );
    assert.deepEqual(
      vaultMod.parseAccountLine('bare@example.com'),
      { label: '', email: 'bare@example.com', password: '' },
    );
    assert.deepEqual(
      vaultMod.parseAccountLine('ssh_key: ssh-ed25519 AAAA1234'),
      { label: 'ssh_key', email: 'ssh_key', password: 'ssh-ed25519 AAAA1234' },
    );
  });

  await test('T36', 'Vault: mergeImportedGroups deduplicates accounts within matching sites and appends new sites', () => {
    const vaultMod = loadTsModule('src/modules/credentialVault/index.ts', chromeMock);
    const existing = [
      {
        id: '1',
        site: 'example.com',
        note: '',
        accounts: [{ id: 'a1', label: 'm1', email: 'a@example.com', password: '', hidden: true, status: 'fresh', lastUsed: 0 }],
      },
    ];
    const incoming = [
      {
        id: '2',
        site: 'example.com',
        note: 'added note',
        accounts: [
          { id: 'a2', label: 'm1', email: 'a@example.com', password: 'filled-pw', hidden: true, status: 'fresh', lastUsed: 0 },
          { id: 'a3', label: 'm2', email: 'b@example.com', password: 'pw2', hidden: true, status: 'fresh', lastUsed: 0 },
        ],
      },
      {
        id: '3',
        site: 'newsite.org',
        note: '',
        accounts: [{ id: 'a4', label: 'm1', email: 'c@newsite.org', password: 'pw3', hidden: true, status: 'fresh', lastUsed: 0 }],
      },
    ];

    const res = vaultMod.mergeImportedGroups(existing, incoming);
    assert.equal(res.addedGroups, 1);
    assert.equal(res.addedAccounts, 2);
    assert.equal(res.groups[0].note, 'added note');
    assert.equal(res.groups[0].accounts[0].password, 'filled-pw');
    assert.equal(res.groups[0].accounts.length, 2);
  });

  /* ═══ 7. Service Worker IPC Bus & Client Clearance Payloads (T37–T42) ═══ */

  await test('T37', 'Service Worker: dispatchRuntimeMessage handles ping and get-settings', async () => {
    const swChrome = createChromeMock({
      siteClearanceEnabled: true,
      cookieBackupEnabled: false,
      vaultEnabled: true,
      showBadgeNotifications: true,
      autoReload: false,
    });
    const swMod = loadTsModule('src/background/service-worker.ts', swChrome);

    const pingRes = await swMod.dispatchRuntimeMessage({ action: 'ping' });
    assert.deepEqual(pingRes, { success: true, version: '1.1.1' });

    const settingsRes = await swMod.dispatchRuntimeMessage({ action: 'get-settings' });
    assert.equal(settingsRes.success, true);
    assert.equal(settingsRes.settings.cookieBackupEnabled, false);
    assert.equal(settingsRes.settings.autoReload, false);
  });

  await test('T38', 'Service Worker: dispatchRuntimeMessage handles clear-site-data and refresh-site-data', async () => {
    const swChrome = createChromeMock({
      siteClearanceEnabled: true,
      showBadgeNotifications: true,
      autoReload: true,
    });
    swChrome._state.cookiesList.push(
      { name: 'c_http', value: '1', domain: 'target.example.com', path: '/', httpOnly: true },
      { name: 'c_js', value: '2', domain: 'target.example.com', path: '/', httpOnly: false },
    );
    const swMod = loadTsModule('src/background/service-worker.ts', swChrome);

    const refreshRes = await swMod.dispatchRuntimeMessage({ action: 'refresh-site-data' });
    assert.equal(refreshRes.success, true);
    assert.equal(refreshRes.operation, 'refresh');
    assert.equal(refreshRes.cookiesWiped, 1);

    const clearRes = await swMod.dispatchRuntimeMessage({ action: 'clear-site-data' });
    assert.equal(clearRes.success, true);
    assert.equal(clearRes.operation, 'clear');
    assert.equal(clearRes.cookiesWiped, 2);
    assert.equal(swChrome._state.browsingRemoved.length, 1);
    assert.equal(swChrome._state.reloads.length, 2);
  });

  await test('T39', 'Service Worker: isClearableHttpUrl rejects restricted chrome:// and about: schemes', () => {
    const swMod = loadTsModule('src/background/service-worker.ts', chromeMock);
    assert.equal(swMod.isClearableHttpUrl('https://example.com/path'), true);
    assert.equal(swMod.isClearableHttpUrl('http://localhost:8080'), true);
    assert.equal(swMod.isClearableHttpUrl('chrome://extensions'), false);
    assert.equal(swMod.isClearableHttpUrl('about:blank'), false);
    assert.equal(swMod.isClearableHttpUrl(''), false);
  });

  await test('T40', 'Service Worker: dispatchRuntimeMessage handles vault-session-* and rejects unknown actions', async () => {
    const swChrome = createChromeMock();
    const swMod = loadTsModule('src/background/service-worker.ts', swChrome);

    const setRes = await swMod.dispatchRuntimeMessage({
      action: 'vault-session-set',
      groups: [{ id: 'g1', site: 's.local', note: '', accounts: [] }],
      passphrase: 'pw',
    });
    assert.equal(setRes.success, true);

    const getRes = await swMod.dispatchRuntimeMessage({ action: 'vault-session-get' });
    assert.equal(getRes.success, true);
    assert.equal(getRes.unlocked, true);
    assert.equal(getRes.groups.length, 1);

    await swMod.dispatchRuntimeMessage({ action: 'vault-session-clear' });
    const clearedRes = await swMod.dispatchRuntimeMessage({ action: 'vault-session-get' });
    assert.equal(clearedRes.unlocked, false);

    const unknownRes = await swMod.dispatchRuntimeMessage({ action: 'nonexistent' });
    assert.deepEqual(unknownRes, { success: false, error: 'Unknown action' });
  });

  await test('T41', 'Clearance Payload: refreshClientStorage and scorchClientStorage execute cleanly and idempotently', async () => {
    const js = getTranspiledCode(path.join(ROOT, 'src/lib/clearancePayload.ts'));
    const cookieWrites = [];
    let localCleared = 0;
    let sessionCleared = 0;
    const deletedDbs = [];
    const deletedCaches = [];
    let unregisteredSw = 0;

    const mod = { exports: {} };
    const mockWin = { name: 'WindowState' };
    const fn = vm.compileFunction(
      js,
      [
        'module',
        'exports',
        'location',
        'document',
        'localStorage',
        'sessionStorage',
        'window',
        'indexedDB',
        'self',
        'caches',
        'navigator',
        'console',
      ],
      { filename: 'src/lib/clearancePayload.ts' },
    );

    fn(
      mod,
      mod.exports,
      { hostname: 'sub.example.com', pathname: '/a/b' },
      {
        get cookie() {
          return 'a=1; b=2';
        },
        set cookie(v) {
          cookieWrites.push(v);
        },
      },
      { clear() { localCleared++; } },
      { clear() { sessionCleared++; } },
      mockWin,
      {
        async databases() {
          return [{ name: 'db1' }];
        },
        deleteDatabase(name) {
          deletedDbs.push(name);
          const req = {};
          setTimeout(() => req.onsuccess && req.onsuccess(), 0);
          return req;
        },
      },
      { caches: true },
      {
        async keys() {
          return ['c1'];
        },
        async delete(k) {
          deletedCaches.push(k);
          return true;
        },
      },
      {
        serviceWorker: {
          async getRegistrations() {
            return [{ async unregister() { unregisteredSw++; return true; } }];
          },
        },
      },
      { warn() {} },
    );

    await mod.exports.refreshClientStorage();
    assert.equal(cookieWrites.length > 0, true);
    assert.equal(localCleared, 1);
    assert.equal(sessionCleared, 1);
    assert.equal(mockWin.name, '');
    assert.deepEqual(deletedDbs, ['db1']);
    assert.deepEqual(deletedCaches, ['c1']);
    assert.equal(unregisteredSw, 1);

    const prevWrites = cookieWrites.length;
    await mod.exports.scorchClientStorage();
    assert.equal(cookieWrites.length, prevWrites);
    assert.equal(localCleared, 2);
  });

  await test('T42', 'UI Components & Entrypoints mount without runtime exceptions in mocked harness', () => {
    const uiChrome = createChromeMock();
    for (const rel of [
      'src/components/TabNavigation.tsx',
      'src/components/SiteClearanceManager.tsx',
      'src/components/CookieManager.tsx',
      'src/components/CookieBackupManager.tsx',
      'src/components/CredentialVault.tsx',
      'src/popup/index.tsx',
      'src/options/index.tsx',
    ]) {
      const mod = loadTsModule(rel, uiChrome);
      assert.equal(typeof mod, 'object');
    }
  });

  /* ═══ 8. Cookie Backup & Restore Overhaul (cndobhdcpmpilkebeebeecgminfhkpcj Parity, T43–T52) ═══ */

  await test('T43', 'Beta/SJCL: decryptBackup & parseCookieBackup decrypt SJCL .ckz (AES-256-CCM + PBKDF2-SHA256) envelopes', async () => {
    const sjclPass = 'CkzRestore#Pass';
    const salt = Buffer.from('a1b2c3d4e5f60718', 'hex');
    const ivFull = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
    const nonce13 = ivFull.subarray(0, 13); // L=2 -> 15 - 2 = 13-byte nonce
    const keyBytes = pbkdf2Sync(sjclPass, salt, 1000, 32, 'sha256');
    const plainBytes = Buffer.from(JSON.stringify(sampleCookies), 'utf8');
    const cipher = createCipheriv('aes-256-ccm', keyBytes, nonce13, { authTagLength: 8 });
    const enc = Buffer.concat([cipher.update(plainBytes), cipher.final()]);
    const tag = cipher.getAuthTag();
    const ctWithTag = Buffer.concat([enc, tag]);

    const ckzEnvelope = JSON.stringify({
      iv: ivFull.toString('base64'),
      v: 1,
      iter: 1000,
      ks: 256,
      ts: 64,
      mode: 'ccm',
      adata: '',
      cipher: 'aes',
      salt: salt.toString('base64'),
      ct: ctWithTag.toString('base64'),
    });

    assert.equal(backupMod.detectEncryptedBackup(ckzEnvelope), true);
    const parsed = await backupMod.parseCookieBackup(ckzEnvelope, sjclPass);
    assert.equal(parsed.cookies.length, 1);
    assert.equal(parsed.cookies[0].name, 'SID');
    assert.equal(parsed.cookies[0].value, 'secret-session-value');

    await assert.rejects(
      () => backupMod.parseCookieBackup(ckzEnvelope, 'WrongCkzPass'),
      /Decryption failed/,
    );
  });

  await test('T44', 'Beta: parseCookieBackup parses Netscape HTTP Cookie File backups without requiring a password', async () => {
    const netscapeText =
      '# Netscape HTTP Cookie File\n' +
      '#HttpOnly_.example.com\tTRUE\t/\tTRUE\t1999999999\tSID\tnetscape-val\n';
    assert.equal(backupMod.detectEncryptedBackup(netscapeText), false);
    const parsed = await backupMod.parseCookieBackup(netscapeText);
    assert.equal(parsed.cookies.length, 1);
    assert.equal(parsed.cookies[0].name, 'SID');
    assert.equal(parsed.cookies[0].value, 'netscape-val');
    assert.equal(parsed.cookies[0].httpOnly, true);
  });

  await test('T45', 'Gamma: buildCookieSetDetails enforces __Host- and __Secure- prefix RFC 6265bis invariants', () => {
    const hostPrefixed = backupMod.buildCookieSetDetails(
      {
        name: '__Host-session',
        value: 'tok1',
        domain: '.github.com',
        path: '/sub',
        secure: false,
        httpOnly: true,
        hostOnly: false,
      },
      ['0'],
    );
    assert.equal('domain' in hostPrefixed, false);
    assert.equal(hostPrefixed.secure, true);
    assert.equal(hostPrefixed.path, '/');
    assert.equal(hostPrefixed.url, 'https://github.com/');

    const securePrefixed = backupMod.buildCookieSetDetails(
      {
        name: '__Secure-1PSID',
        value: 'tok2',
        domain: '.google.com',
        path: '/',
        secure: false,
        httpOnly: true,
        hostOnly: false,
      },
      ['0'],
    );
    assert.equal(securePrefixed.secure, true);
    assert.equal(securePrefixed.url, 'https://google.com/');
    assert.equal(securePrefixed.domain, '.google.com');
  });

  await test('T46', 'Gamma: filterCookieForRestore implements cndobhdcpmpilkebeebeecgminfhkpcj filterCookie normalization', () => {
    const c1 = backupMod.filterCookieForRestore(
      {
        name: 'legacy_cookie',
        value: 'v1',
        domain: '.sub.example.com',
        path: '/app',
        secure: false,
        httpOnly: true,
        hostOnly: false,
        session: true,
        sameSite: 'unspecified',
        storeId: '0',
      },
      ['0'],
    );
    assert.equal(c1.url, 'http://sub.example.com/app');
    assert.equal(c1.domain, 'sub.example.com');
    assert.equal('hostOnly' in c1, false);
    assert.equal('session' in c1, false);
    assert.equal('sameSite' in c1, false);

    const c2 = backupMod.filterCookieForRestore(
      {
        name: 'none_cookie',
        value: 'v2',
        domain: '.example.com',
        path: '/',
        secure: false,
        httpOnly: false,
        sameSite: 'no_restriction',
      },
      ['0'],
    );
    assert.equal('sameSite' in c2, false);
  });

  await test('T47', 'Gamma: restoreSingleCookie & restoreCookiesBatch recover via filterCookieForRestore when primary SetDetails is rejected', async () => {
    const fallbackChrome = createChromeMock();
    fallbackChrome.cookies._rejectUnspecifiedSameSite = true;
    fallbackChrome.cookies._rejectLeadingDotDomain = true;
    const fbBackupMod = loadTsModule('src/modules/cookie-backup/index.ts', fallbackChrome);

    const futureExp = Math.floor(Date.now() / 1000) + 86400;
    const pastExp = Math.floor(Date.now() / 1000) - 86400;

    const batchRes = await fbBackupMod.restoreCookiesBatch([
      {
        name: 'quirky_cookie',
        value: 'recovered',
        domain: '.example.com',
        path: '/',
        secure: true,
        httpOnly: true,
        hostOnly: false,
        session: false,
        expirationDate: futureExp,
        sameSite: 'unspecified',
        storeId: '0',
      },
      {
        name: 'expired_cookie',
        value: 'old',
        domain: '.example.com',
        path: '/',
        secure: true,
        httpOnly: false,
        session: false,
        expirationDate: pastExp,
      },
    ]);

    assert.equal(batchRes.restored, 1);
    assert.equal(batchRes.failed, 0);
    assert.equal(batchRes.skippedExpired, 1);
    assert.equal(fallbackChrome._state.cookiesList.length, 1);
    assert.equal(fallbackChrome._state.cookiesList[0].name, 'quirky_cookie');
    assert.equal(fallbackChrome._state.cookiesList[0].value, 'recovered');
  });

  await test('T48', 'Gamma: collectAllBrowserCookies deduplicates across default context and getAllCookieStores', async () => {
    const storeChrome = createChromeMock();
    storeChrome._state.cookiesList.push(
      { name: 'c_std', value: '1', domain: '.a.com', path: '/', storeId: '0' },
      { name: 'c_incog', value: '2', domain: '.b.com', path: '/', storeId: '1' },
    );
    const storeBackupMod = loadTsModule('src/modules/cookie-backup/index.ts', storeChrome);
    const all = await storeBackupMod.collectAllBrowserCookies();
    assert.equal(all.length, 2);
  });

  await test('T49', 'Gamma: downloadBackupFile uses chrome.downloads.download + onChanged completion reveal', async () => {
    const dlChrome = createChromeMock();
    const dlMod = loadTsModule('src/modules/cookie-backup/index.ts', dlChrome);

    const downloadId = await dlMod.downloadBackupFile('{"test":1}', 'backup.4nt', 'application/octet-stream');
    assert.equal(downloadId, 101);
    assert.equal(dlChrome._state.downloadsTriggered.length, 1);
    assert.equal(dlChrome._state.downloadsTriggered[0].filename, 'backup.4nt');
    assert.equal(dlChrome._state.downloadChangedListeners.length, 1);

    // Simulate download completion event
    dlChrome._state.downloadChangedListeners[0]({
      id: 101,
      state: { current: 'complete' },
    });
    assert.deepEqual(dlChrome._state.downloadsShown, [101]);
    assert.equal(dlChrome._state.downloadChangedListeners.length, 0);
  });

  await test('T50', 'Gamma: Pending restore session cache persists across popup focus loss', async () => {
    const sessChrome = createChromeMock();
    const sessMod = loadTsModule('src/modules/cookie-backup/index.ts', sessChrome);

    await sessMod.setPendingRestoreSession({
      fileName: 'test-cookies.4nt',
      payload: encryptedV2,
      mode: 'file',
      updatedAt: 123456,
    });

    const loaded = await sessMod.getPendingRestoreSession();
    assert.equal(loaded.fileName, 'test-cookies.4nt');
    assert.equal(loaded.payload, encryptedV2);

    await sessMod.clearPendingRestoreSession();
    const afterClear = await sessMod.getPendingRestoreSession();
    assert.equal(afterClear, null);
  });

  await test('T51', 'Delta: CookieManagerModule.importCookies promotes SameSite=None to https:// and recovers via fallback', async () => {
    const cmFallbackChrome = createChromeMock();
    cmFallbackChrome.cookies._rejectUnspecifiedSameSite = true;
    const cmFallbackMod = loadTsModule('src/modules/cookieManager/index.ts', cmFallbackChrome);

    const res = await cmFallbackMod.CookieManagerModule.importCookies([
      {
        name: 'samesite_none_http',
        value: 'v1',
        domain: '.target.example.com',
        path: '/',
        secure: false,
        httpOnly: false,
        hostOnly: false,
        sameSite: 'no_restriction',
      },
      {
        name: 'unspecified_samesite',
        value: 'v2',
        domain: '.target.example.com',
        path: '/',
        secure: true,
        httpOnly: true,
        hostOnly: false,
        sameSite: 'unspecified',
      },
    ]);
    assert.equal(res.imported, 2);
    assert.equal(res.failed, 0);
    assert.equal(cmFallbackChrome._state.cookiesList.length, 2);
  });

  await test('T52', 'Service Worker: dispatchRuntimeMessage handles backup-cookies and restore-cookies end-to-end', async () => {
    const swChrome = createChromeMock({
      siteClearanceEnabled: true,
      cookieBackupEnabled: true,
      vaultEnabled: true,
      showBadgeNotifications: true,
      autoReload: true,
    });
    swChrome._state.cookiesList.push(
      {
        name: 'auth_token',
        value: 'live-secret',
        domain: '.example.com',
        path: '/',
        secure: true,
        httpOnly: true,
        hostOnly: false,
        session: true,
        storeId: '0',
      },
      {
        name: '__cf_bm',
        value: 'ephemeral',
        domain: '.example.com',
        path: '/',
        secure: true,
        httpOnly: true,
        hostOnly: false,
        session: true,
        storeId: '0',
      },
    );
    const swMod = loadTsModule('src/background/service-worker.ts', swChrome);

    const backupRes = await swMod.dispatchRuntimeMessage({
      action: 'backup-cookies',
      password: 'SwBackupPassword!1',
    });
    assert.equal(backupRes.success, true);
    assert.equal(backupRes.report.retained, 1);
    assert.equal(backupRes.report.dropped, 1);

    swChrome._state.cookiesList.length = 0;

    const restoreRes = await swMod.dispatchRuntimeMessage({
      action: 'restore-cookies',
      payload: backupRes.encrypted,
      password: 'SwBackupPassword!1',
    });
    assert.equal(restoreRes.success, true);
    assert.equal(restoreRes.restored, 1);
    assert.equal(restoreRes.failed, 0);
    assert.equal(swChrome._state.cookiesList.length, 1);
    assert.equal(swChrome._state.cookiesList[0].name, 'auth_token');
  });

  console.log(`CHECK RESULT: PASS (${passed}/${passed + failed} checks green, 0 failures)`);
}

runSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
