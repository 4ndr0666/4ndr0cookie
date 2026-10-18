<div align="center">

# ⚡ 4ndr0cookie – Red-Team Quality of Life Chrome Extension

<img src="https://raw.githubusercontent.com/4ndr0666/nas/refs/heads/main/images/icons/4ndr0cookie.png" width="128" alt="logo"/>

<br/>

<a href="https://opensource.org/licenses/ISC">
  <img src="https://img.shields.io/badge/License-ISC-blue.svg"/>
</a>
<img src="https://img.shields.io/github/package-json/v/4ndr0666/4ndr0cookie?color=cyan&label=version"/>
<img src="https://img.shields.io/github/actions/workflow/status/4ndr0666/4ndr0cookie/ci.yml?branch=main&label=build"/>
<img src="https://img.shields.io/npm/dt/4ndr0cookie?color=brightgreen&label=downloads"/>
<img src="https://img.shields.io/badge/chrome-v88%2B-orange.svg"/>
<img src="https://img.shields.io/badge/status-active-success.svg"/>

A **unified, powerful Chrome extension** with essential engagement tools crafted for red-team operations and engagements.
</div>

---

## 🎯 Features

### 🗄️ Credential Vault
- Grouped throwaway-identity rotation tracker (consolidates the legacy Email List Manager and PasteManager)
- Zero hardcoded seed credentials in source code — clean empty initialization by default
- At-rest AES-256-GCM vault sealing (`VaultStorageEnvelope` in `chrome.storage.local`) with PBKDF2-HMAC-SHA256 (310,000 iterations) and ephemeral unlocked session caching in `chrome.storage.session`
- Email + password pairs with short labels (m1, m2…) and instant site/account search filter
- Rotation tracking: every copy auto-stamps last-used; first Fresh account is marked `▸ NEXT IN ROTATION`
- Account status tracking (Fresh → Active → Exhausted)
- Integrated notes field (2FA, credits, trial details)
- Quick-copy HUD: single-click email, double-click password
- Bulk copy: all emails, or `label: email` lines
- Text import: `label: email: password`, `email: password`, `label: email`, bare emails, or `label: secret` pairs
- Automatic migration and immediate key-scrubbing of legacy `emailGroups`, `emailList`, `pasteEntries`, and `pasteManagerItems`
- AES-256-GCM encrypted `.vault` (`4ntv` binary and JSON envelope) export/import via native Web Crypto API

### 🧹 Site Clearance Manager
- `Alt+C` → instant clearance of site data  
- Clears cookies, local/session storage, indexedDB, webSQL, cache  
- Badge feedback (✓ success / ✗ error)  
- Optional auto-reload  
- One-click manual clearance  
- Domain-specific scope  

### 🍪 Cookie Tools
- JSON / Netscape formats — clipboard (stealth mode) or file download
- Auto-detecting import: JSON arrays, `{cookies:[…]}` wrappers, or Netscape files (via file upload or inline paste fallback)
- Inline cookie editing (name/value) with lossless identity and SameSite/storeId handling
- Per-cookie delete and bulk site delete
- Domain-specific, search-filtered view  

### 💾 Encrypted Cookie Backup
- One-click system-wide backup across all active cookie stores (`collectAllBrowserCookies`) with `chrome.downloads.download` delivery and one-click clipboard copy
- AES-256-GCM via native Web Crypto API (zero dependencies)
- PBKDF2 key derivation — SHA-256, 310,000 iterations  
- Export sanitization: ephemeral tokens (`__cf_bm`, `_ga*`, `__Secure-*PSIDTS`, …) never enter the baseline  
- JSON envelope carrying IV + salt + ciphertext  
- Restores current `.4nt` (v2), legacy v1.0.x `.4nt`, SJCL `.ckz` (`Cookie Backup and Restore` compatibility via pure Web Crypto AES-CCM/GCM), JSON, and Netscape formats  
- Resilient popup restoration: immediate `FileReader` ingestion, session-persisted pending state (`chrome.storage.session`), inline paste-text fallback (`"Unable to upload a file? Paste backup"`), and one-click full-tab popout (`↗ Full Tab`)  
- Multi-tier hardened upsert restore (`Promise.allSettled`, `buildCookieSetDetails` + `filterCookieForRestore` fallback, `__Host-`/`__Secure-`/`SameSite=None` HTTPS URL synthesis, live sessions never swept, expired skipped) with progress feedback  

### 🎨 Dark Theme Interface
- Futuristic HUD style (#111827 background, #15FFFF highlights)  
- Unified look across all modules  
- Responsive, modern Tailwind v4 layout  

---

## 🚀 Installation

### Quick Setup
```bash
git clone https://github.com/4ndr0666/4ndr0cookie.git
npm install
npm run build
```

**Load in Chrome:**

1. Open `chrome://extensions/`
2. Enable **Developer Mode**
3. Select **Load unpacked** → `dist/`

### Development

```bash
npm start
```

### Verification & Production

```bash
npm run check
npm run docs
npm run build
```

---

## 📁 Project Structure

```
4ndr0cookie/
├── src/
│   ├── background/            # Service worker (Alt+C, async IPC dispatcher)
│   ├── components/            # React UI components (Vault, SCM, Cookie Tools, Backup)
│   ├── modules/               # Core isolated logic (cookies, backup crypto, vault crypto)
│   ├── lib/                   # Shared payload utilities
│   ├── popup/                 # Popup interface
│   ├── options/               # Options/settings
│   ├── assets/                # Icons & static files
│   └── env.d.ts               # Global TypeScript declarations
├── tools/                     # Automated verification & documentation gates
├── dist/                      # Compiled extension
├── manifest.json              # Manifest V3
├── package.json               # Dependencies & verification scripts
├── webpack.*.js               # Build configs (Webpack 5)
└── tsconfig.json              # Strict TypeScript config
```

---

## 🏗️ Architecture

### Manifest V3

* Service worker only
* Scoped permissions
* Best practices compliant

### Modular Design

* Isolated feature modules (`cookieManager`, `cookie-backup`, `credentialVault`)
* Shared utilities (`clearancePayload`)
* React components
* Strict TypeScript enforcement

### Performance

* Lazy-loading
* Optimized storage usage
* Resource cleanup
* Minimal permissions
* Fine-tuned Webpack 5 chunking

---

## 📖 Usage Guide

* **Credential Vault** → track throwaway rotations, seal vault at rest with AES-256-GCM, single-click copy, `.vault` export/import
* **Site Clearance** → `Alt+C` or popup button
* **Cookie Tools** → JSON/Netscape export (clipboard/file), file or paste import, inline edit
* **Backup/Restore** → Encrypted `.4nt` / `.ckz` system backups with file upload, paste fallback, and full-tab mode
* **Options** → Live-wired feature flags, sync settings, import/export

---

## 🔐 Permissions

* `storage` – save vaults, settings, and backup stats
* `activeTab` – site-specific operations
* `cookies` – manage/export/backup
* `downloads` – save `.4nt` and `.vault` encrypted backups
* `browsingData` – clear local data
* `scripting` – manage sessionStorage
* `<all_urls>` – required for clearance scope

**Shortcut:** `Alt+C` → instant clearance

---

## 🔒 Security & Privacy

* Local-only storage with zero hardcoded seed credentials
* No external calls
* Native Web Crypto API implementation
* AES-256-GCM encryption for `.4nt` backups, `.vault` exports, and sealed at-rest vault storage
* PBKDF2 with salt (310,000 iterations, SHA-256)
* Ephemeral unlocked session cache via `chrome.storage.session`
* Automatic scrubbing of legacy plaintext storage keys on migration
* Strict CSP and scoped operations

---

## 🌐 Compatibility

* **Chrome** v88+
* **Chromium browsers** (Edge, Brave, Opera)

---

## 📋 Changelog

### v1.1.1 – Pipeline Overhaul, Sensitive Storage Redesign & Gap Mitigation

* **Sensitive Storage Redesign**: extracted `src/modules/credentialVault/index.ts`, purged all hardcoded personal seed credentials from source code, added at-rest AES-256-GCM vault sealing (`VaultStorageEnvelope`) with `chrome.storage.session` ephemeral unlock caching, and automated scrubbing of legacy `emailGroups`/`emailList`/`pasteEntries`/`pasteManagerItems` storage keys
* **Cookie Backup & Restore Hardened**:
  * Wired `chrome.downloads.download` + `chrome.downloads.onChanged` completion reveal (`downloadBackupFile`) with deferred `URL.revokeObjectURL` cleanup so popup downloads never fail from premature blob revocation
  * Added immediate `FileReader` ingestion, `chrome.storage.session` pending-restore persistence, inline paste-text fallback (`"Unable to upload a file? Paste backup"`), clipboard backup copy, and `↗ Full Tab` popout (`?tab=backup`) to eliminate popup focus-loss failures during OS file selection
  * Added `filterCookieForRestore` and 3-tier `restoreSingleCookie` / `restoreCookiesBatch` (`cndobhdcpmpilkebeebeecgminfhkpcj` parity: strips leading domain dot, drops `no_restriction`/`unspecified` SameSite on fallback, enforces `__Host-`/`__Secure-` and `SameSite=None` HTTPS URL synthesis)
  * Added native Web Crypto RFC 3610 AES-CCM / AES-GCM decryption for SJCL `.ckz` backups alongside `.4nt` (v2/v1), JSON, and Netscape formats via `parseCookieBackup`
* **Cookie Tools fixed**: single-site JSON/Netscape export (clipboard + download), auto-detecting file and paste import (JSON / Netscape), inline cookie editing with SameSite/storeId preservation, bulk site delete
* **Export sanitization matrix**: Cloudflare/bot tokens, sliding-window auth tickets, and telemetry cookies are excluded from long-term recovery baselines
* **Netscape fidelity**: `#HttpOnly_` prefix on export, normalized domain/subdomain flags, full parser on import (lossless round-trip)
* **Credential Vault upgraded** into a rotation tracker: last-used stamping on every copy, `▸ NEXT IN ROTATION` marker, account labels, site/account search filter, bulk copy, lossless text import, legacy email-list/paste/flat-credential migration, quick-copy popover status badge fix
* **Service Worker IPC bus wired**: complete async `dispatchRuntimeMessage` handler (`ping`, `get-settings`, `clear-site-data`, `refresh-site-data`, `backup-cookies`, `restore-cookies`, `vault-session-*`) with HTTP/HTTPS scheme validation
* **Options wired live**: every toggle now gates real behavior; autoReload sync/local mismatch fixed; vault feature flag added
* **Icon system**: `#15FFFF` outlined unicode icons (`.hud-icon`) on tabs and controls
* **Dead code purge**: PasteManager, EmailListManager, ClipboardManager, debug console dump, crypto-js/express dependencies removed — zero stubs, zero orphaned references
* Verified: strict TypeScript/Babel compilation, 52-point automated verification battery (`npm run check`), idempotent documentation gate (`npm run docs`)

### v1.1.0 – Architecture & Vault Update

* Added Credential Vault replacing PasteManager
* Implemented AES-256-GCM `.vault` export/import via native WebCrypto
* Increased PBKDF2 iterations to 310,000 for enhanced cryptography
* Upgraded to Tailwind CSS v4
* Enforced strict TypeScript array tuples and state typing
* Webpack 5 performance optimization

### v1.0.0 – Initial Release

* Email List Manager
* Alt+C Site Clearance
* Cookie Export (JSON/Netscape)
* Encrypted Cookie Backup/Restore (.4nt)
* Dark cyan HUD UI
* Manifest V3 + Service Worker
* React + TypeScript + Tailwind v3

---

## 🗺️ Roadmap

* [ ] Configurable shortcuts
* [ ] Context menu integration
* [ ] External red-team tool integrations
* [ ] ChaCha20-Poly1305 support
* [ ] Hardware key integration

---

## ⚡ Quick Reference

* **Shortcut**: `Alt+C` site clearance
* **File (Cookies)**: `.4nt` (AES-256-GCM encrypted backup) / `.ckz` (SJCL compatible)
* **File (Vault)**: `.vault` (AES-256-GCM encrypted credentials)
* **Theme**: Dark (#111827) + Cyan (#00E5FF) + icon accent (#15FFFF)

---

**Made with ⚡ for red-team efficiency**
