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
- Grouped credential store per website
- Integrated notes field (2FA, credits, trial details)
- Account status tracking (Fresh → Active → Exhausted)
- Quick-copy HUD: single-click email, double-click password
- AES-256-GCM encrypted `.vault` export/import via native Web Crypto API

### 📧 Email List Manager
- One-click dropdown to switch between groups  
- Inline editing for labels (m1, m2...) and emails  
- Copy individual entries or bulk (emails/labels)  
- Import/export lists via text  
- Dynamic group management  

### 🧹 Site Clearance Manager
- `Alt+C` → instant clearance of site data  
- Clears cookies, local/session storage, indexedDB, webSQL, cache  
- Badge feedback (✓ success / ✗ error)  
- Optional auto-reload  
- One-click manual clearance  
- Domain-specific scope  

### 🍪 Cookie Export Tools
- JSON / Netscape formats  
- One-click copy to clipboard  
- No downloads (stealth mode)  
- Domain-specific export  

### 💾 Encrypted Cookie Backup
- One-click system-wide backup  
- AES-256-GCM encryption 
- Custom `.4nt` encrypted format  
- Restore with live progress feedback  
- User password protection  

### 🎨 Dark Theme Interface
- Futuristic HUD style (#111827 background, #15FFFF highlights)  
- Unified look across all modules  
- Responsive, modern Tailwind v4 layout  

---

## 🚀 Installation

### Quick Setup
```bash
git clone <repo-url>
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

### Production

```bash
npm run build

```

---

## 📁 Project Structure

```
4ndr0tools/
├── src/
│   ├── background/            # Service worker (Alt+C, IPC)
│   ├── components/            # React UI components (Vault, SCM, Backup)
│   ├── modules/               # Core isolated logic and handlers
│   ├── lib/                   # Shared payload utilities
│   ├── popup/                 # Popup interface
│   ├── options/               # Options/settings
│   ├── assets/                # Icons & static files
│   └── env.d.ts               # Global TypeScript declarations
├── dist/                      # Compiled extension
├── manifest.json              # Manifest V3
├── package.json               # Dependencies
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

* Isolated feature modules
* Shared utilities
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

* **Credential Vault** → store accounts, single-click copy, `.vault` AES-256 export
* **Email Lists** → manage groups, copy/export/import
* **Site Clearance** → `Alt+C` or popup button
* **Cookie Export** → JSON/Netscape formats, clipboard only
* **Backup/Restore** → Encrypted `.4nt` system backups
* **Options** → Customize behavior and UI

---

## 🔐 Permissions

* `storage` – save lists, vaults, and settings
* `activeTab` – site-specific operations
* `cookies` – manage/export/backup
* `downloads` – save `.4nt` and `.vault` encrypted backups
* `browsingData` – clear local data
* `scripting` – manage sessionStorage
* `<all_urls>` – required for clearance scope

**Shortcut:** `Alt+C` → instant clearance

---

## 🔒 Security & Privacy

* Local-only storage
* No external calls
* Native Web Crypto API implementation
* AES-256-GCM encryption
* PBKDF2 with salt (310,000 iterations)
* Passwords never stored
* Strict CSP
* Scoped operations

---

## 🌐 Compatibility

* **Chrome** v88+
* **Chromium browsers** (Edge, Brave, Opera)

---

## 📋 Changelog

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
* [ ] Cookie editing tools
* [ ] Settings import/export
* [ ] External red-team tool integrations
* [ ] ChaCha20-Poly1305 support
* [ ] Hardware key integration

---

## ⚡ Quick Reference

* **Shortcut**: `Alt+C` site clearance
* **File (Cookies)**: `.4nt` (AES-256 encrypted backup)
* **File (Vault)**: `.vault` (AES-256 encrypted credentials)
* **Theme**: Dark (#111827) + Cyan (#00E5FF)

---

**Made with ⚡ for red-team efficiency**
