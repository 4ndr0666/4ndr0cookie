#!/usr/bin/env bash
###############################################################################
# codex-merge-clean.sh
# Remove Git/Codex merge-conflict markers and tidy trailing whitespace.
# Keeps the *upper* (“ours”) half by default; use --keep-lower to keep lower.
# Skips binary files. Safe POSIX-sh. Passes shellcheck -x.
#
# Usage:
#   codex-merge-clean.sh [--keep-lower] <file1> [file2 …]
###############################################################################
set -euo pipefail
IFS=$'\n\t'

KEEP_UPPER=1            # default; 0 = keep lower half
TMP_SUFFIX=".codexclean.tmp"

usage() { printf 'Usage: %s [--keep-lower] <file ...>\n' "${0##*/}" >&2; exit 1; }
warn()  { printf '⚠️  %s\n' "$*" >&2; }

# --- argument parsing --------------------------------------------------------
while [ $# -gt 0 ]; do
  case $1 in
    --keep-lower) KEEP_UPPER=0 ;;
    -h|--help)    usage ;;
    --) shift; break ;;
    -*) warn "Unknown option: $1"; usage ;;
    *)  break ;;
  esac
  shift
done
[ $# -eq 0 ] && usage

# --- main loop ---------------------------------------------------------------
for FILE in "$@"; do
  [ -f "$FILE" ] || { warn "File not found: $FILE"; exit 2; }

  # Skip binary files
  if ! grep -Iq . "$FILE"; then
    warn "Skipping binary: $FILE"; continue
  fi

  TEMP="${FILE}${TMP_SUFFIX}"
  awk -v keep_upper="$KEEP_UPPER" '
    BEGIN { inside=0; take=1 }
    /^[[:space:]]*<{7}/ { inside=1; take=keep_upper; next }
    /^[[:space:]]*={7}/ { if (inside) { take = !keep_upper; next } }
    /^[[:space:]]*>{7}/ { inside=0; next }
    {
      if (!inside)          { sub(/[[:space:]]+$/, ""); print; next }
      if (inside && take)   { sub(/[[:space:]]+$/, ""); print }
    }
  ' "$FILE" >"$TEMP"

  # Ensure exactly one trailing newline
  printf '\n' >>"$TEMP"

  mv -f -- "$TEMP" "$FILE"
  printf '✔ cleaned %s\n' "$FILE"
done
