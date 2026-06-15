#!/usr/bin/env python3
"""Unpublish (delist) a game AND retract its @timsgamelab announcement in one step.

WHY THIS EXISTS (2026-06-15). The bake-off cleanup (Gallery#13cd445) flipped a few
games to `published:false` by hand-editing games.source.json. That correctly delists
them (the /p/<slug> share page 404s "no longer available" for an unpublished game) —
but it left their LIVE Telegram launch posts pointing at a now-dead link. Subscribers
clicked "Play" and hit the wall (msg 140 Arrow Out, 142 Critter Crates). The fix is to
make unpublishing ALSO retract the announcement, every time, so a culled game can never
leave a dead link behind.

This tool:
  1. sets `published:false` for <slug> in Gallery/games.source.json (1-line diff),
  2. deletes the slug's @timsgamelab post(s) via the announce-reconciler's
     message-aware retractor (it NEVER deletes a shared digest post that still
     announces a live game — those are reported for a manual edit instead),
  3. optionally runs sync_games.sh, and reminds you to commit + push (the delist
     only goes live on a Cloudflare deploy).

Usage:
  unpublish_game.py <slug> [--reason "..."] [--sync] [--dry-run]
  unpublish_game.py <slug> --no-retract        # flip the flag only, leave posts
  unpublish_game.py <slug> --republish          # flip published back to true (no post change)

Notes:
  * --dry-run prints the flag change + which posts WOULD be retracted; writes nothing.
  * Retraction hits the live channel immediately (before deploy) so the dead link
    cannot reach subscribers; push afterwards to actually delist the game.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]          # .../Agents
GALLERY = ROOT / "Gallery"
SRC = GALLERY / "games.source.json"
SYNC = GALLERY / "scripts" / "sync_games.sh"
RECONCILE_DIR = ROOT / "Shared" / "tools" / "announce-reconcile"


def load_source() -> list:
    return json.loads(SRC.read_text(encoding="utf-8"))


def write_source(games: list) -> None:
    # ensure_ascii=False + indent=2 + trailing newline reproduces the file
    # byte-for-byte, so flipping one flag is a clean 1-line diff.
    SRC.write_text(json.dumps(games, indent=2, ensure_ascii=False) + "\n",
                   encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("slug", help="game slug to unpublish (or republish)")
    ap.add_argument("--reason", default="", help="why (logged to stdout only)")
    ap.add_argument("--no-retract", action="store_true",
                    help="flip the published flag only; leave the Telegram post(s)")
    ap.add_argument("--republish", action="store_true",
                    help="set published back to true (does NOT re-post anything)")
    ap.add_argument("--sync", action="store_true",
                    help="run sync_games.sh after the flag change")
    ap.add_argument("--dry-run", action="store_true",
                    help="print the change + posts that would be retracted; write nothing")
    ap.add_argument("--channel-pages", type=int, default=25,
                    help="Telegram web pages to scan when finding posts (default 25)")
    args = ap.parse_args(argv)

    games = load_source()
    entry = next((g for g in games if g.get("slug") == args.slug), None)
    if entry is None:
        print(f"{args.slug}: not found in {SRC.name}", file=sys.stderr)
        return 1

    target = True if args.republish else False
    verb = "republish" if args.republish else "unpublish"
    cur = entry.get("published", True)
    if cur == target:
        print(f"{args.slug}: already published={target} (no flag change needed)")
    else:
        print(f"{args.slug}: published {cur} -> {target}"
              + (f"   reason: {args.reason}" if args.reason else ""))
        if not args.dry_run:
            entry["published"] = target
            write_source(games)

    # Retract the announcement when unpublishing (not on republish / --no-retract).
    if not args.republish and not args.no_retract:
        sys.path.insert(0, str(RECONCILE_DIR))
        try:
            import announce_reconcile as ar  # noqa: E402
        except Exception as e:  # noqa: BLE001
            print(f"  ! could not import announce_reconcile ({e}); "
                  f"retract manually: announce_reconcile.py --retract-slug {args.slug}")
        else:
            # allow_target_live: the deployed manifest still shows this game live
            # (we delist on the upcoming push), but we ARE pulling it, so deleting
            # all of its OWN posts is intended. Shared-with-other-live posts are
            # still protected inside retract_slug.
            res = ar.retract_slug(args.slug, do_delete=not args.dry_run,
                                  allow_target_live=True, max_pages=args.channel_pages)
            if not res["found"]:
                print(f"  no @timsgamelab post links /p/{args.slug} (nothing to retract)")
            elif args.dry_run:
                print(f"  WOULD retract msg {res['targets']}")
            else:
                print(f"  retracted msg {res['deleted']}"
                      + (f"; FAILED {res['failed']}" if res["failed"] else ""))
            for mid, live in res["skipped_shared"]:
                print(f"  SKIP shared msg {mid} — also announces live: {', '.join(live)} "
                      f"(edit that post by hand instead of deleting it)")

    if args.sync and not args.dry_run:
        print("  running sync_games.sh ...")
        rc = subprocess.run(["bash", str(SYNC)], cwd=str(GALLERY))
        if rc.returncode != 0:
            print("  ! sync_games.sh failed — fix before pushing", file=sys.stderr)
            return 1

    if not args.dry_run:
        nxt = "republish" if args.republish else "delist"
        print(f"\nNext: commit + push Gallery to {nxt} on the live site:")
        print("  (cd Gallery && git add games.source.json games.json && "
              f"git commit -m '{verb} {args.slug}' && git push)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
