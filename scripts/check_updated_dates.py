#!/usr/bin/env python3
"""Fail when a public game changes without a meaningful updatedDate.

The gate compares two committed trees. It covers catalogue copy/destination
changes plus public game, thumbnail, and preview files. Date-only granularity
allows multiple legitimate updates on the same UTC day.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import subprocess
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
SLUG_RE = re.compile(r"^[a-z0-9_-]{1,64}$")
PUBLIC_FIELDS = (
    "title", "title_ru", "title_es", "title_pt", "title_tr", "title_ar",
    "hook", "hook_ru", "hook_es", "hook_pt", "hook_tr", "hook_ar",
    "genre", "published", "platforms", "external", "flagship", "hosting",
    "sandboxUrl", "author", "builtWith", "addedDate", "updatedDate",
)


def clean_git_env() -> dict[str, str]:
    """Prevent an enclosing Git hook from redirecting nested local commands."""
    return {
        key: value
        for key, value in os.environ.items()
        if not key.startswith("GIT_")
    }


def git(*args: str, check: bool = True) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=ROOT,
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=clean_git_env(),
    )
    if check and result.returncode:
        raise RuntimeError(result.stderr.strip() or f"git {' '.join(args)} failed")
    return result.stdout


def load_source(ref: str) -> dict[str, dict[str, Any]]:
    text = git("show", f"{ref}:games.source.json", check=False)
    if not text:
        return {}
    value = json.loads(text)
    if not isinstance(value, list):
        raise RuntimeError(f"{ref}:games.source.json is not an array")
    return {
        item["slug"]: item
        for item in value
        if isinstance(item, dict)
        and isinstance(item.get("slug"), str)
        and SLUG_RE.fullmatch(item["slug"])
    }


def public_projection(item: dict[str, Any] | None) -> tuple[Any, ...] | None:
    if item is None:
        return None
    return tuple(json.dumps(item.get(field), sort_keys=True, ensure_ascii=False) for field in PUBLIC_FIELDS)


def path_slugs(base: str, target: str) -> set[str]:
    paths = git("diff", "--name-only", f"{base}..{target}", "--").splitlines()
    slugs: set[str] = set()
    for path in paths:
        game = re.match(r"^games/([^/]+)/", path)
        if game and SLUG_RE.fullmatch(game.group(1)):
            slugs.add(game.group(1))
            continue
        asset = re.match(r"^(?:thumbs|previews)/([^/.]+?)(?:__v\d+)?\.(?:png|webp|webm)$", path)
        if asset and SLUG_RE.fullmatch(asset.group(1)):
            slugs.add(asset.group(1))
    return slugs


def parse_date(value: Any) -> dt.date | None:
    text = str(value or "")
    if not DATE_RE.fullmatch(text):
        return None
    try:
        return dt.date.fromisoformat(text)
    except ValueError:
        return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--from", dest="base", required=True)
    parser.add_argument("--to", dest="target", required=True)
    args = parser.parse_args()

    old = load_source(args.base)
    new = load_source(args.target)
    changed = path_slugs(args.base, args.target)
    changed.update(
        slug
        for slug in old.keys() | new.keys()
        if public_projection(old.get(slug)) != public_projection(new.get(slug))
    )
    target_date_text = git("show", "-s", "--format=%cs", args.target).strip()[:10]
    target_date = parse_date(target_date_text)
    if target_date is None:
        raise RuntimeError(f"target commit has invalid date: {target_date_text}")
    failures: list[str] = []
    checked = 0
    for slug in sorted(changed):
        current = new.get(slug)
        previous = old.get(slug)
        if current is None:
            continue
        # Never-published drafts do not affect a public discovery surface.
        if current.get("published") is False and previous is None:
            continue
        checked += 1
        added_text = str(current.get("addedDate") or "")
        updated_text = str(current.get("updatedDate") or "")
        previous_updated = str((previous or {}).get("updatedDate") or "")
        added = parse_date(added_text)
        updated = parse_date(updated_text)
        if added is None:
            failures.append(f"{slug}: missing/invalid immutable addedDate")
            continue
        if previous is not None and added_text != str(previous.get("addedDate") or ""):
            failures.append(
                f"{slug}: addedDate is immutable "
                f"({previous.get('addedDate')!r} -> {added_text!r})"
            )
            continue
        if updated is None:
            failures.append(
                f"{slug}: public change requires updatedDate (run scripts/mark_game_updated.py {slug})"
            )
            continue
        if added > target_date:
            failures.append(f"{slug}: addedDate {added_text} is after target commit date {target_date_text}")
            continue
        if updated < added:
            failures.append(f"{slug}: updatedDate {updated_text} predates addedDate {added_text}")
            continue
        if updated > target_date:
            failures.append(
                f"{slug}: updatedDate {updated_text} is after target commit date {target_date_text}"
            )
            continue
        if (
            previous is not None
            and updated_text == previous_updated
            and updated != target_date
        ):
            failures.append(
                f"{slug}: public change kept stale updatedDate={updated_text}; "
                f"target commit date is {target_date_text}"
            )

    if failures:
        print("updatedDate gate: FAIL")
        for failure in failures:
            print(f"  - {failure}")
        return 1
    print(f"updatedDate gate: PASS ({checked} changed public game(s))")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError, json.JSONDecodeError) as error:
        print(f"updatedDate gate: ERROR: {error}")
        raise SystemExit(2)
