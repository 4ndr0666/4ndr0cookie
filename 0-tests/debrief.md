# Debrief

- Reconfirmed the `.4nt` format (salt + iv + ciphertext + tag) with the bundled sample so the Brave restore flow derives the AES-GCM key from `4utotroph` correctly.
- Wired an immediate password prompt when an encrypted backup is chosen and a secondary prompt during restore, preventing the popup from closing before the credential is captured.
- Cached the decrypted cookie list once authentication succeeds and kept the restore action enabled, allowing Brave to replay the payload without forcing the user to reopen the file chooser.
- Retained the PBKDF2/AES-GCM regression coverage in `0-tests/decrypt-restore-check.js` to guarantee the sanitized cookie payload stays compatible with `chrome.cookies.set`.
