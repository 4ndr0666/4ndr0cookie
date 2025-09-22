#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const [,, inputFile] = process.argv;
const backupPath = inputFile
  ? path.resolve(process.cwd(), inputFile)
  : path.resolve(__dirname, '4ndr0tools-cookies-2025-09-19T13-44-54-981Z.4nt');

if (!fs.existsSync(backupPath)) {
  console.error(`Backup file not found: ${backupPath}`);
  process.exit(1);
}

const password = process.env.BACKUP_PASSWORD || '4utotroph';
const rawData = fs.readFileSync(backupPath, 'utf8').trim();
if (!rawData) {
  console.error('Backup file is empty.');
  process.exit(1);
}

const sanitizePayload = (payload) => payload.replace(/\s+/g, '');
const payload = sanitizePayload(rawData);
if (payload.length <= 44 || payload.length % 4 !== 0) {
  console.error('Encrypted backup payload is malformed.');
  process.exit(1);
}

const buffer = Buffer.from(payload, 'base64');
if (buffer.length <= 44) {
  console.error('Encrypted backup payload is too short.');
  process.exit(1);
}

const salt = buffer.subarray(0, 16);
const iv = buffer.subarray(16, 28);
const ciphertext = buffer.subarray(28, buffer.length - 16);
const authTag = buffer.subarray(buffer.length - 16);

const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
decipher.setAuthTag(authTag);

let plaintext;
try {
  plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
} catch (error) {
  console.error('Failed to decrypt backup:', error.message);
  process.exit(1);
}

let cookies;
try {
  cookies = JSON.parse(plaintext.toString('utf8'));
} catch (error) {
  console.error('Decrypted payload is not valid JSON:', error.message);
  process.exit(1);
}

if (!Array.isArray(cookies)) {
  console.error('Decrypted backup does not contain a cookie array.');
  process.exit(1);
}

const buildCookieSetDetails = (cookie) => {
  const protocol = cookie.secure ? 'https:' : 'http:';
  const pathValue = cookie.path && cookie.path.startsWith('/') ? cookie.path : `/${cookie.path || ''}`;
  const normalizedDomain = cookie.domain && cookie.domain.startsWith('.')
    ? cookie.domain.slice(1)
    : cookie.domain;
  const hostname = normalizedDomain || cookie.domain;
  if (!hostname) {
    throw new Error(`Cookie ${cookie.name} is missing a domain`);
  }

  const details = {
    url: `${protocol}//${hostname}${pathValue}`,
    name: cookie.name,
    value: cookie.value ?? '',
    path: pathValue,
    secure: Boolean(cookie.secure),
    httpOnly: Boolean(cookie.httpOnly)
  };

  if (!cookie.hostOnly && cookie.domain) {
    details.domain = cookie.domain;
  }

  if (cookie.sameSite && cookie.sameSite !== 'unspecified') {
    details.sameSite = cookie.sameSite;
  }

  if (!cookie.session && typeof cookie.expirationDate === 'number') {
    details.expirationDate = cookie.expirationDate;
  }

  if (cookie.storeId) {
    details.storeId = cookie.storeId;
  }

  // Validate URL can be parsed
  new URL(details.url);
  return details;
};

let sanitizedCount = 0;
for (const cookie of cookies) {
  try {
    buildCookieSetDetails(cookie);
    sanitizedCount += 1;
  } catch (error) {
    console.error(`Failed to normalize cookie ${cookie.name}: ${error.message}`);
    process.exit(1);
  }
}

console.log(
  JSON.stringify(
    {
      backup: path.basename(backupPath),
      cookies: cookies.length,
      sanitized: sanitizedCount,
      passwordUsed: password ? 'env/BACKUP_PASSWORD or default' : 'none'
    },
    null,
    2
  )
);

