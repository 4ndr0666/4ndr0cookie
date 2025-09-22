# Changelog

## 2025-09-26
- Removed intrusive `window.prompt` password requests so the Brave popup stays open and relies on the inline password field for encrypted restores.
- Added reactive pre-decryption on password input to surface cookie counts and validation errors before running the restore loop.
- Tightened status messaging for plaintext vs encrypted backups to align with the updated flow and avoid surprise prompts.

## 2025-09-25
- Added interactive password prompting when encrypted backups are selected so the Brave popup no longer closes before credentials are captured.
- Cached decrypted payloads once a password succeeds and relaxed the restore button gating, enabling replays without re-reading the file dialog.
- Hardened the restore controller to reuse parsed cookies, reprompt on demand, and surface friendly errors when decryption fails.

## 2025-09-24
- Hardened the `.4nt` decryptor to validate payload structure, split the AES-GCM auth tag, and require passwords before processing encrypted backups.
- Added deterministic backup inspection so encrypted files keep the restore action disabled until a password is supplied and plaintext payloads report cookie counts.
- Introduced `0-tests/decrypt-restore-check.js` to verify PBKDF2/AES-GCM decryption and Brave-compatible cookie normalization against the sample backup.

## 2025-09-23
- Improved the Brave restore workflow to prompt for missing passwords and handle plaintext backups gracefully.
- Updated the restore UI copy to reflect automatic password prompts and the revised enablement logic.

