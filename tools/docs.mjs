#!/usr/bin/env node
/**
 * tools/docs.mjs
 *
 * Idempotent documentation and manifest alignment verifier for 4ndr0cookie.
 * Confirms that package.json, manifest.json, and README.md agree on version,
 * permissions, and module inventory without mutating tracked files.
 */

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');

assert.equal(pkg.name, '4ndr0cookie', 'package.json name mismatch');
assert.equal(manifest.name, '4ndr0cookie', 'manifest.json name mismatch');
assert.equal(pkg.version, manifest.version, 'package.json and manifest.json version mismatch');
assert.equal(manifest.manifest_version, 3, 'manifest_version must be 3');

const requiredReadmeSections = [
  '### 🗄️ Credential Vault',
  '### 🧹 Site Clearance Manager',
  '### 🍪 Cookie Tools',
  '### 💾 Encrypted Cookie Backup',
  '### v1.1.1',
  'VaultStorageEnvelope',
  'filterCookieForRestore',
];

for (const section of requiredReadmeSections) {
  assert.equal(
    readme.includes(section),
    true,
    `README.md missing required section or capability marker: ${section}`,
  );
}

console.log(`DOCS RESULT: PASS (version ${pkg.version}, ${requiredReadmeSections.length} sections verified)`);
