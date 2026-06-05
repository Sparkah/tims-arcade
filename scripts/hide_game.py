#!/usr/bin/env python3
"""Hide / unhide a game from the public gallery grid.

This is the CLI path for "hide game X": it POSTs to the LIVE admin API
(/api/admin/hidden, token from Gallery/.dev.vars) so the game drops off the
homepage INSTANTLY (KV-backed, no redeploy), then mirrors the current hidden
list to Shared/data/hidden-games.json so the factory + digest can treat hidden
games as a low-quality signal.

Usage:
  hide_game.py <slug>            # hide
  hide_game.py <slug> --unhide   # unhide
  hide_game.py --list            # print the current hidden set + refresh mirror

Env:
  GALLERY_BASE   override the API base (default https://game-factory.tech)
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]          # .../Agents
GALLERY = ROOT / "Gallery"
MIRROR = ROOT / "Shared" / "data" / "hidden-games.json"
BASE = os.environ.get("GALLERY_BASE", "https://game-factory.tech").rstrip("/")


def read_token() -> str:
    env_tok = os.environ.get("ADMIN_TOKEN")
    if env_tok:
        return env_tok.strip()
    for fn in (GALLERY / ".dev.vars", GALLERY / ".env"):
        if not fn.exists():
            continue
        for line in fn.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("ADMIN_TOKEN"):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("ADMIN_TOKEN not found in Gallery/.dev.vars or Gallery/.env")


def call(method: str, token: str, body: dict | None = None) -> dict:
    url = f"{BASE}/api/admin/hidden?token={urllib.parse.quote(token)}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url, data=data, method=method,
        headers={"content-type": "application/json", "x-admin-token": token},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:200]
        raise SystemExit(f"API {method} failed: HTTP {exc.code} {detail}")
    except Exception as exc:
        raise SystemExit(f"API {method} failed: {exc}")


def write_mirror(hidden: list[str]) -> None:
    MIRROR.parent.mkdir(parents=True, exist_ok=True)
    MIRROR.write_text(json.dumps({
        "hidden": sorted(hidden),
        "count": len(hidden),
        "updated": dt.date.today().isoformat(),
        "note": "Games hidden from the public gallery grid = a LOW-QUALITY signal. "
                "The factory/digest should avoid re-suggesting or iterating these. "
                "Source of truth is the VOTES KV `hidden:set`; this file is a mirror "
                "written by Gallery/scripts/hide_game.py.",
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Hide/unhide a game from the public gallery.")
    ap.add_argument("slug", nargs="?", help="game slug (omit with --list)")
    ap.add_argument("--unhide", action="store_true", help="unhide instead of hide")
    ap.add_argument("--list", action="store_true", help="just print + refresh the mirror")
    args = ap.parse_args(argv)

    token = read_token()

    if args.list or not args.slug:
        res = call("GET", token)
        hidden = res.get("hidden", [])
        write_mirror(hidden)
        print(f"{len(hidden)} hidden: {', '.join(hidden) if hidden else '(none)'}")
        print(f"mirror: {MIRROR}")
        return 0

    hide = not args.unhide
    res = call("POST", token, {"slug": args.slug, "hide": hide})
    hidden = res.get("hidden", [])
    write_mirror(hidden)
    verb = "hidden" if hide else "unhidden"
    print(f"{args.slug}: {verb}.  now {len(hidden)} hidden: {', '.join(hidden) if hidden else '(none)'}")
    print(f"mirror: {MIRROR}")
    print("(live now on game-factory.tech — KV-backed, no redeploy)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
