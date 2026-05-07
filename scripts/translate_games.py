#!/usr/bin/env python3
"""
Bulk-translate every game's EN title + hook into ES/PT/TR/AR via a single
Claude call, then merge the new title_<lang> / hook_<lang> fields back into
games.source.json. Idempotent — only translates fields that don't yet exist
(or are empty), so re-runs after new builds only translate the deltas.

Usage:
  python3 Gallery/scripts/translate_games.py
  python3 Gallery/scripts/translate_games.py --langs es,pt --force
  python3 Gallery/scripts/translate_games.py --dry-run

Run after: any new game appended via append_game.sh.
"""

from __future__ import annotations
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GAMES_JSON = ROOT / "Gallery" / "games.source.json"

DEFAULT_LANGS = ["es", "pt", "tr", "ar"]
LANG_NAMES = {
    "es": "Spanish",
    "pt": "Portuguese (Brazil-friendly)",
    "tr": "Turkish",
    "ar": "Arabic",
}


def find_claude() -> str:
    for p in [shutil.which("claude"),
              os.path.expanduser("~/.local/bin/claude"),
              "/usr/local/bin/claude",
              "/opt/homebrew/bin/claude"]:
        if p and Path(p).exists():
            return p
    raise SystemExit("claude binary not found")


def needs_translation(game: dict, lang: str, force: bool) -> bool:
    if force:
        return True
    return not (game.get(f"title_{lang}") and game.get(f"hook_{lang}"))


def build_prompt(games: list[dict], langs: list[str]) -> str:
    # Compact payload so the model can reason about all games at once.
    payload = []
    for g in games:
        payload.append({
            "slug":  g["slug"],
            "title": g.get("title", ""),
            "hook":  g.get("hook", ""),
            "missing": [l for l in langs if not (g.get(f"title_{l}") and g.get(f"hook_{l}"))]
        })
    payload_str = json.dumps(payload, indent=2, ensure_ascii=False)
    lang_lines = "\n".join(f"  - {l}: {LANG_NAMES[l]}" for l in langs)

    return f"""You translate short HTML5 game titles and hooks for the multilingual gallery game-factory.tech.

For each game in the input array, translate `title` and `hook` from English into the languages listed in that game's `missing` array. Languages may include:
{lang_lines}

Translation rules:
- Preserve TONE — these are casual playful game pitches, keep the same energy
- Preserve LENGTH within ~30% (don't pad, don't compress)
- Don't translate proper nouns / made-up words (e.g. "Sprunki", "Geometry Dash" stay as-is); but translate descriptive components ("Dodge Run" → reasonable equivalent)
- For Arabic: use natural MSA/Levantine-friendly phrasing, right-to-left mark needed
- For Turkish: use the modern colloquial register games actually use
- For Spanish/Portuguese: Latin-American friendly (skip "vosotros"; use "tu/você" style)

INPUT:
{payload_str}

OUTPUT a single JSON object keyed by slug. For each slug, include only the languages the game asked for. Each language entry has both `title` and `hook`. Skip games whose `missing` array is empty.

Format example (do NOT output any prose, code fence, or commentary — just the JSON):

{{
  "clean_sweep": {{
    "es": {{ "title": "Limpiador Donut", "hook": "Rueda un donut con chispas..." }},
    "pt": {{ "title": "Donut Faxineiro",  "hook": "..." }}
  }},
  "ice_sweeper": {{
    "tr": {{ "title": "...", "hook": "..." }}
  }}
}}
"""


def call_claude(prompt: str, timeout: int = 360) -> dict:
    proc = subprocess.run(
        [find_claude(), "--print", "--dangerously-skip-permissions"],
        input=prompt, capture_output=True, text=True, timeout=timeout,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"claude exited {proc.returncode}: {proc.stderr[:500]}")
    out = proc.stdout.strip()
    m = re.search(r"\{[\s\S]*\}", out)
    if not m:
        raise RuntimeError(f"no JSON object in claude output: {out[:400]}")
    return json.loads(m.group(0))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--langs", default=",".join(DEFAULT_LANGS),
                    help="comma-separated lang codes (default: es,pt,tr,ar)")
    ap.add_argument("--force", action="store_true",
                    help="re-translate even fields that already exist")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    langs = [l.strip() for l in args.langs.split(",") if l.strip()]

    games = json.loads(GAMES_JSON.read_text(encoding="utf-8"))
    needing = [g for g in games if any(needs_translation(g, l, args.force) for l in langs)]
    if not needing:
        print("All games already have translations for", ",".join(langs))
        return 0

    print(f"Translating {len(needing)} games × {len(langs)} languages → {len(needing) * len(langs)} pairs")
    if args.dry_run:
        for g in needing:
            missing = [l for l in langs if needs_translation(g, l, args.force)]
            print(f"  {g['slug']}: needs {missing}")
        return 0

    prompt = build_prompt(needing, langs)
    translations = call_claude(prompt)

    updated = 0
    for g in games:
        slug = g["slug"]
        block = translations.get(slug, {})
        for lang, pair in block.items():
            if not isinstance(pair, dict):
                continue
            t = pair.get("title", "").strip()
            h = pair.get("hook", "").strip()
            if t:
                g[f"title_{lang}"] = t
                updated += 1
            if h:
                g[f"hook_{lang}"] = h
                updated += 1

    GAMES_JSON.write_text(json.dumps(games, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"✓ wrote {GAMES_JSON} ({updated} fields updated across {len(games)} games)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
