#!/usr/bin/env bash
###############################################################################
# merge-clean.sh
# Iteratively resolves merge conflicts based on user-defined rules.
# In each pass, it keeps the content between '<<<<<<<' and '=======', 
# and discards the content between '=======' and '>>>>>>>'.
###############################################################################
set -euo pipefail
IFS=$'\n\t'

TMP_SUFFIX=".codexclean.tmp"

usage() { printf 'Usage: %s <file ...>\n' "${0##*/}" >&2; exit 1; }
warn()  { printf '⚠️  %s\n' "$*" >&2; }

[ $# -eq 0 ] && usage

# --- main loop ---------------------------------------------------------------
for FILE in "$@"; do
  [ -f "$FILE" ] || { warn "File not found: $FILE"; exit 2; }

  # Skip binary files
  if ! grep -Iq . "$FILE"; then
    warn "Skipping binary: $FILE"; continue
  fi

  TEMP="${FILE}${TMP_SUFFIX}"

  # Loop until no more conflict markers are found
  while grep -q -E '^[[:space:]]*<{7}' "$FILE"; do
    awk ' \
      BEGIN { in_conflict=0; in_patch=0; } \
      /^[[:space:]]*<{7}/ { if (!in_conflict) { in_conflict=1; in_patch=1; next } } \
      /^[[:space:]]*={7}/ { if (in_conflict && in_patch) { in_patch=0; next } } \
      /^[[:space:]]*>{7}/ { if (in_conflict && !in_patch) { in_conflict=0; next } } \
      { \
        if (!in_conflict) { print; next } \
        if (in_conflict && in_patch) { print } \
      } \
    ' "$FILE" > "$TEMP"
    mv -f "$TEMP" "$FILE"
  done

  # Final cleanup of any stray markers
  sed -i -e '/^[[:space:]]*[<=>]{7}/d' "$FILE"

  # Ensure exactly one trailing newline
  # Create a temporary file for the final output
  TEMP_FINAL="${FILE}${TMP_SUFFIX}.final"
  { cat "$FILE"; printf '\n'; } > "$TEMP_FINAL"
  # Remove trailing whitespace and ensure single newline at EOF
  sed -e 's/[[:space:]]*$//' -e '${/^$/d;}' "$TEMP_FINAL" > "$FILE"
  rm -f "$TEMP" "$TEMP_FINAL"

  printf '✔ cleaned %s\n' "$FILE"
done
