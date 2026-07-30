#!/usr/bin/env python3
"""Set meaningful catalogue updatedDate values before a Gallery sync.

Call this with the exact slugs whose public game, thumbnail, copy, translation,
visibility, or platform destination changed. It never guesses from mtimes and
never rewrites addedDate.

Usage:
    python3 scripts/mark_game_updated.py merge_guns hue_sort
    python3 scripts/mark_game_updated.py --date 2026-07-30 merge_guns
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "games.source.json"
SLUG_RE = re.compile(r"^[a-z0-9_-]{1,64}$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("slugs", nargs="+", help="catalogue slugs updated publicly")
    parser.add_argument("--date", default=dt.date.today().isoformat())
    parser.add_argument("--check", action="store_true", help="validate only; do not write")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not DATE_RE.fullmatch(args.date):
        raise SystemExit("--date must be YYYY-MM-DD")
    try:
        dt.date.fromisoformat(args.date)
    except ValueError as error:
        raise SystemExit(f"invalid --date: {error}") from error

    requested = list(dict.fromkeys(args.slugs))
    invalid = [slug for slug in requested if not SLUG_RE.fullmatch(slug)]
    if invalid:
        raise SystemExit(f"invalid slug(s): {', '.join(invalid)}")

    data = json.loads(SOURCE.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise SystemExit("games.source.json must be an array")
    by_slug = {
        entry.get("slug"): entry
        for entry in data
        if isinstance(entry, dict) and isinstance(entry.get("slug"), str)
    }
    missing = [slug for slug in requested if slug not in by_slug]
    if missing:
        raise SystemExit(f"unknown slug(s): {', '.join(missing)}")

    for slug in requested:
        entry = by_slug[slug]
        if not DATE_RE.fullmatch(str(entry.get("addedDate") or "")):
            raise SystemExit(f"{slug}: missing/invalid immutable addedDate")
        entry["updatedDate"] = args.date

    if args.check:
        print(f"validated {len(requested)} slug(s) for updatedDate={args.date}")
        return 0

    handle, temp_name = tempfile.mkstemp(
        prefix=f".{SOURCE.name}.",
        suffix=".tmp",
        dir=SOURCE.parent,
        text=True,
    )
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as stream:
            json.dump(data, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp_name, SOURCE)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)

    print(f"updatedDate={args.date}: {', '.join(requested)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
