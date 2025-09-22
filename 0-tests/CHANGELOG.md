# Changelog

## 2025-09-23
- Improved the Brave restore workflow to prompt for missing passwords and handle plaintext backups gracefully.
- Updated the restore UI copy to reflect automatic password prompts and the revised enablement logic.

## 2025-09-24
- Hardened the `.4nt` decryptor to validate payload structure, split the AES-GCM auth tag, and require passwords before processing encrypted backups.
- Added deterministic backup inspection so encrypted files keep the restore action disabled until a password is supplied and plaintext payloads report cookie counts.
- Introduced `0-tests/decrypt-restore-check.js` to verify PBKDF2/AES-GCM decryption and Brave-compatible cookie normalization against the sample backup.



