#!/usr/bin/env bash
# Manifest duplicate guard — block a games.source.json / games.json that ships
# the SAME game twice.
#
# Why this exists (2026-07-27): the 2026-07-25 bulk publish ("Publish 66 games
# to the library") derived each new entry's slug from the DIRECTORY name and
# deduped on slug alone. Seven games had been renamed since launch, so their
# curated slug no longer matched their folder — creature_hunt vs the folder
# Games/10_running_away. Slug-dedup saw no collision and appended a second
# entry pointing at the same gameDir. Result: Creature Hunt, Apartment Cleaner,
# Rail Tycoon, Daily Dodge, Satisfying Spill, Shader Chip Loadout and 2048
# Brain Rot Band each rendered TWICE in the gallery and the admin board, with
# the duplicate holding zero play/vote history.
#
# gameDir is the real identity of a game; slug is a renameable label. So this
# gate keys on gameDir (trailing slash normalised) and on title, not on slug.
#
# Exit 0 = clean, 1 = duplicates found.

set -uo pipefail

GALLERY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

fail=0
for manifest in games.source.json games.json; do
  path="$GALLERY_ROOT/$manifest"
  [[ -f "$path" ]] || continue
  if ! out="$(python3 "$GALLERY_ROOT/scripts/check_manifest_dupes.py" "$path")"; then
    printf '%s\n' "$out" >&2
    fail=1
  fi
done

if (( fail )); then
  cat >&2 <<'EOF'

   A game is listed twice. Keep the entry with the curated slug + localisation
   (title_ru/title_es/...) and the play history; drop the directory-derived one.
   Then re-run: bash Gallery/scripts/sync_games.sh
EOF
  exit 1
fi

echo "manifest dupe guard: clean"
exit 0
