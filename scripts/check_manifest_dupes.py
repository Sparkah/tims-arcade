#!/usr/bin/env python3
"""Report games listed twice in a Gallery manifest. See check_manifest_dupes.sh.

Keys on gameDir (the real identity, trailing slash normalised) and on title,
because slug is a renameable label — that is exactly how the 2026-07-25 bulk
publish slipped seven duplicates past a slug-only dedup.
"""
import collections
import json
import sys


def norm_dir(value):
    return (value or "").strip().rstrip("/")


def norm_title(value):
    return (value or "").strip().casefold()


def main(path):
    try:
        games = json.load(open(path, encoding="utf-8"))
    except Exception as exc:  # unreadable manifest is itself a push blocker
        print(f"manifest dupe guard: cannot read {path}: {exc}")
        return 1

    if not isinstance(games, list):
        print(f"manifest dupe guard: {path} is not a JSON array")
        return 1

    by_dir = collections.defaultdict(list)
    by_title = collections.defaultdict(list)
    for game in games:
        if not isinstance(game, dict):
            continue
        slug = game.get("slug") or "<no slug>"
        gdir = norm_dir(game.get("gameDir"))
        if gdir:
            by_dir[gdir].append(slug)
        title = norm_title(game.get("title"))
        if title:
            by_title[title].append(slug)

    problems = []
    for gdir, slugs in sorted(by_dir.items()):
        if len(slugs) > 1:
            problems.append(f"  gameDir {gdir} is claimed by {len(slugs)} entries: {', '.join(slugs)}")
    for title, slugs in sorted(by_title.items()):
        if len(slugs) > 1:
            problems.append(f"  title {title!r} is used by {len(slugs)} entries: {', '.join(slugs)}")

    if problems:
        print(f"manifest dupe guard: {len(problems)} duplicate(s) in {path}")
        print("\n".join(problems))
        return 1
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: check_manifest_dupes.py <manifest.json>")
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
