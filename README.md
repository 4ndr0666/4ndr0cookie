# 4ndr0tools - Red-Team Quality of Life Chrome Extension

A powerful, unified Chrome extension designed for red-team operations and productivity. This extension consolidates essential engagement tools into a single, modern interface with a futuristic dark theme and cyan highlights.

## 🎯 Features

### 📧 Email List Manager
- **One-Click Dropdown**: Select from multiple named email groups
- **Editable Rows**: Inline editing for labels (m1, m2...) and email addresses
- **Individual Copy**: Copy button for each email entry
- **Bulk Operations**: "Copy All Emails" and "Copy All Labels" buttons
- **Import/Export**: Import email lists from text and export groups
- **Dynamic Management**: Add, edit, and delete email groups on-the-fly

### 🧹 Site Clearance Manager
- **Alt+C Hotkey**: Instant site data clearance with configurable keyboard shortcut
- **Complete Clearance**: Removes cookies, localStorage, sessionStorage, indexedDB, webSQL, and cache
- **Visual Feedback**: Badge notifications (✓ success, ✗ error) with auto-clear
- **Auto-Reload**: Optional page reload after clearance
- **Manual Control**: One-click manual clearance button in popup
- **Site-Specific**: Only affects the current active tab's domain

### 🍪 Cookie Export Tools
- **JSON Format**: Export current site cookies as formatted JSON
- **Netscape Format**: Export in tab-delimited Netscape cookie format
- **One-Click Copy**: Direct copy to clipboard with visual confirmation
- **No File Downloads**: All exports go directly to clipboard for stealth operations
- **Site-Specific**: Only exports cookies for the current active tab

### 💾 Encrypted Cookie Backup
- **System-Wide Backup**: One-click backup of all browser cookies
- **AES-256-GCM Encryption**: Military-grade encryption with PBKDF2 key derivation
- **Custom .4nt Format**: Encrypted backup files with random salt and IV
- **One-Click Restore**: Decrypt and restore all cookies with progress tracking
- **Password Protection**: User-defined passwords for backup security
- **Progress Feedback**: Real-time restoration progress with cookie counts

### 🎨 Dark Theme Interface
- **Futuristic HUD Design**: Dark background (#111827) with cyan highlights (#15FFFF)
- **Consistent Styling**: Unified color scheme across all components
- **Red-Team Aesthetic**: Professional dark interface suitable for operations
- **Responsive Layout**: Clean, modern UI with intuitive navigation

## 🚀 Installation

### Quick Setup

1. **Clone or download** this repository to your local machine
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Build the extension**:
   ```bash
   npm run build
   ```
4. **Load in Chrome**:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" in the top right
   - Click "Load unpacked" and select the `dist` folder

### Production Build

For a production-ready build:
```bash
npm run build
```

### Development Mode

For development with hot reload:
```bash
npm run dev
```

## 📁 Project Structure

```
4ndr0tools/
├── src/
│   ├── background/           # Service worker for Alt+C hotkey
│   │   └── service-worker.ts
│   ├── components/           # React components
│   │   ├── TabNavigation.tsx      # Tab navigation UI
│   │   ├── EmailListManager.tsx   # Email list management
│   │   ├── SiteClearanceManager.tsx # Site data clearance
│   │   ├── CookieManager.tsx      # Cookie export tools
│   │   └── CookieBackupManager.tsx # Encrypted backup/restore
│   ├── popup/                # Extension popup interface
│   │   ├── index.tsx         # Main popup component
│   │   ├── popup.html        # Popup HTML template
│   │   └── popup.css         # Popup styling
│   ├── options/              # Settings/options page
│   │   ├── index.tsx         # Options component
│   │   ├── options.html      # Options HTML template
│   │   └── options.css       # Options styling
│   └── assets/               # Icons and static files
│       └── icons/            # Extension icons (16, 48, 128px)
├── dist/                     # Built extension files (load this in Chrome)
├── manifest.json             # Extension manifest (Manifest V3)
├── package.json              # Dependencies and build scripts
├── webpack.common.js         # Shared webpack configuration
├── webpack.dev.js            # Development build config
├── webpack.prod.js           # Production build config
├── tsconfig.json             # TypeScript configuration
├── tailwind.config.js        # Tailwind CSS configuration
└── postcss.config.js         # PostCSS configuration
```

## Architecture

### Manifest V3 Compliance
- Uses modern service worker instead of background pages
- Implements proper permission handling
- Follows Chrome Extension best practices

### Modular Design
- **Separation of Concerns**: Each feature is isolated in its own module
- **Shared Utilities**: Common functionality is centralized
- **Component-Based UI**: Reusable React components
- **Type Safety**: Full TypeScript implementation

### Performance Optimizations
- **Lazy Loading**: Modules loaded only when needed
- **Efficient Storage**: Optimized chrome.storage usage
- **Memory Management**: Proper cleanup and garbage collection
- **Minimal Permissions**: Only requests necessary permissions

## 📖 Usage Guide

### Email List Management
1. Click the extension icon to open the popup
2. Navigate to the "Email Lists" tab
3. Select an email group from the one-click dropdown
4. Click "New Group" to create additional email groups
5. Add entries with labels (m1, m2...) and email addresses
6. Use individual "📋 Copy" buttons for each email
7. Use "Copy All Emails" or "Copy All Labels" for bulk operations
8. Import email lists from text using the "Import from Text" feature

### Site Data Clearance
**Keyboard Shortcut:**
- Press `Alt+C` on any website to instantly clear all site data
- Watch for badge feedback: ✓ (success) or ✗ (error)

**Manual Control:**
1. Navigate to the "Site Clearance" tab in popup
2. Click "🧹 Clear Current Site" for manual clearance
3. Toggle "Auto-reload after clearance" as needed
4. View current site information and clearance status

### Cookie Export
1. Navigate to the "Cookie Tools" tab
2. View all cookies for the current active site
3. Use search bar to filter cookies by name
4. Click "📋 Copy JSON" to export cookies as formatted JSON
5. Click "📋 Copy Netscape" to export in Netscape format
6. All exports go directly to clipboard (no file downloads)
7. Delete individual cookies using the "🗑️ Delete" buttons

### Encrypted Cookie Backup
1. Navigate to the "Backup/Restore" tab
2. **For Backup:**
   - Enter a secure password
   - Click "💾 One-Click Backup" 
   - Save the generated .4nt file securely
3. **For Restore:**
   - Click "📁 Select .4nt File" and choose your backup
   - Enter the backup password
   - Click "📥 One-Click Restore"
   - Monitor progress as cookies are restored

### Settings Configuration
1. Right-click the extension icon and select "Options"
2. Configure feature toggles for each component
3. Set preferences for auto-reload and badge notifications
4. Adjust UI and behavior settings
5. Click "Save Settings" to apply changes

## Development

### Available Scripts

- `npm start` - Start development build with watch mode
- `npm run build` - Create production build
- `npm run dev` - Development build (same as start)

### Adding New Features

1. **Create Module**: Add new module in `src/modules/`
2. **Add Component**: Create React component in `src/components/`
3. **Update Navigation**: Add tab to `src/popup/index.tsx`
4. **Update Manifest**: Add required permissions if needed
5. **Build & Test**: Run `npm run build` and test in Chrome

### TypeScript Support

The project uses TypeScript for type safety and better development experience:
- All source files use `.ts` or `.tsx` extensions
- Type definitions for Chrome APIs via `@types/chrome`
- Strict type checking enabled

### Styling

- **Tailwind CSS**: Utility-first CSS framework
- **Responsive Design**: Mobile-friendly interface
- **Consistent Theme**: Unified color scheme and spacing
- **Dark Mode Ready**: Prepared for future dark mode support

## 🔐 Permissions

The extension requests the following permissions:

- `storage` - For saving email lists, settings, and configuration
- `activeTab` - For accessing current tab information and site-specific operations
- `cookies` - For cookie management, export, and backup functionality
- `downloads` - For saving encrypted .4nt backup files
- `browsingData` - For clearing site data (cookies, cache, localStorage, etc.)
- `scripting` - For clearing sessionStorage via content scripts
- `<all_urls>` - For cookie access and site clearance across all domains

### Commands
- `Alt+C` - Configured keyboard shortcut for instant site data clearance

## 🔒 Security & Privacy

- **Local Storage**: All email lists and settings stored locally on your device
- **No External Requests**: Extension operates entirely offline with no external communication
- **Minimal Permissions**: Only requests permissions necessary for core functionality
- **AES-256-GCM Encryption**: Cookie backups use military-grade encryption
- **PBKDF2 Key Derivation**: 100,000 iterations with random salt for password security
- **No Password Storage**: Passwords never stored or transmitted
- **Content Security Policy**: Strict CSP implementation prevents code injection
- **Site-Specific Operations**: Cookie exports and clearance limited to current active tab

## Browser Compatibility

- **Chrome**: Version 88+ (Manifest V3 support)
- **Chromium-based browsers**: Edge, Brave, Opera (with Manifest V3 support)

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Troubleshooting

### Common Issues

**Extension not loading:**
- Ensure you've run `npm run build` first
- Check that all files are present in the `dist` folder
- Verify Chrome Developer Mode is enabled
- Confirm manifest.json points to correct background script path

**Alt+C hotkey not working:**
- Check that the keyboard shortcut isn't conflicted with other extensions
- Verify the extension has proper permissions for the current site
- Look for badge feedback (✓ or ✗) to confirm command registration

**Cookie operations failing:**
- Ensure you're on a website (not chrome:// pages)
- Check that cookies exist for the current site
- Verify activeTab permission is granted

**Backup/Restore issues:**
- Confirm password is entered correctly (case-sensitive)
- Check that .4nt file isn't corrupted
- Ensure sufficient storage space for large cookie sets

### Debug Mode

To enable debug logging:
1. Open Chrome DevTools (F12)
2. Go to the Console tab
3. Look for messages prefixed with "4ndr0tools"
4. Check the Service Worker console for background script logs

### Service Worker Settings
- **"Unregister service workers"**: ✅ Keep checked (helps with development)
- **"Bypass for Network"**: ❌ Keep unchecked (would break Alt+C functionality)

## License

This project is licensed under the ISC License - see the package.json file for details.

## 📋 Changelog

### Version 1.0.0 - Initial Release
- ✅ Email List Manager with one-click dropdown and editable rows
- ✅ Alt+C hotkey for instant site data clearance
- ✅ Cookie export in JSON and Netscape formats (clipboard copy)
- ✅ Encrypted system-wide cookie backup and restore (.4nt format)
- ✅ Dark theme with #15FFFF cyan highlights throughout
- ✅ Manifest V3 compliance with modern service worker
- ✅ React + TypeScript + Tailwind CSS implementation
- ✅ Comprehensive options/settings page
- ✅ Site-specific operations for stealth and precision

## 🗺️ Roadmap

### Planned Features
- [ ] Configurable keyboard shortcuts for all functions
- [ ] Context menu integration for right-click operations
- [ ] Advanced email list templates and categories
- [ ] Cookie editing and modification capabilities
- [ ] Import/Export of extension settings and configurations
- [ ] Advanced search and filtering across all components
- [ ] Batch operations for multiple sites
- [ ] Integration with external red-team tools

### Security Enhancements
- [ ] Additional encryption algorithms (ChaCha20-Poly1305)
- [ ] Hardware security key integration
- [ ] Secure password generation for backups
- [ ] Audit logging for all operations

---

## ⚡ Quick Reference

### Keyboard Shortcuts
- `Alt+C` - Instant site data clearance

### File Formats
- `.4nt` - Encrypted cookie backup files (AES-256-GCM)

### Export Formats
- **JSON** - Structured cookie data for programmatic use
- **Netscape** - Tab-delimited format compatible with curl and wget

### Color Scheme
- **Background**: #111827 (Gray-900)
- **Highlights**: #15FFFF (Cyan)
- **Text**: #F9FAFB (Gray-50)

---

**Made with ⚡ for red-team operations and quality of life**
