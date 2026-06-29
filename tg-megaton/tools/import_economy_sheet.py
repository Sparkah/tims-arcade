#!/usr/bin/env python3
"""Build Megaton's economy config JS from exported Google Sheet CSV tabs."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path


RARITIES = ("common", "rare", "epic", "legendary", "mythic")


def pct(value: str) -> float:
    text = str(value or "").strip()
    if text.endswith("%"):
        return round(float(text[:-1]) / 100, 6)
    return round(float(text), 6)


def number(value: str):
    text = str(value or "").strip()
    if not text:
        return 0
    try:
        n = float(text)
    except ValueError:
        return text
    return int(n) if n.is_integer() else n


def truthy(value: str) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "y", "on"}


def read_rows(path: Path):
    with path.open(newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def build_mission(row: dict) -> dict:
    mission = {
        "id": row.get("mission_id", "").strip(),
        "type": row.get("type", "").strip(),
        "title": row.get("title", "").strip(),
        "desc": row.get("notes", "").strip(),
        "url": row.get("url", "").strip(),
        "reward": {
            "caps": int(number(row.get("reward_caps", "0")) or 0),
            "crates": int(number(row.get("reward_crates", "0")) or 0),
            "boxId": row.get("reward_box", "mission_reward").strip() or "mission_reward",
        },
    }
    if "repeatable" in row and row.get("repeatable"):
        mission["repeatable"] = truthy(row.get("repeatable"))
    if row.get("cooldown_ms"):
        mission["cooldownMs"] = int(number(row.get("cooldown_ms", "0")) or 0)
    if "first_share_box" in row and row.get("first_share_box"):
        mission["firstShareBox"] = truthy(row.get("first_share_box"))
    if row.get("repeat_caps_factor"):
        mission["repeatCapsFactor"] = number(row.get("repeat_caps_factor", "0"))
    return mission


def build_weekly_reward(row: dict) -> dict:
    reward = {
        "label": row.get("rank_label", "").strip(),
        "min": int(number(row.get("min_rank", "0")) or 0),
        "max": int(number(row.get("max_rank", "0")) or 0),
        "crates": int(number(row.get("reward_crates", "0")) or 0),
    }
    ton = str(row.get("reward_ton", "") or "").strip()
    nanotons = str(row.get("reward_nanotons", "") or "").strip()
    if ton and nanotons:
        reward["ton"] = ton
        reward["nanotons"] = nanotons
    return reward


def build_config(source_dir: Path) -> dict:
    chests = read_rows(source_dir / "chests.csv")
    weekly = read_rows(source_dir / "weekly_rewards.csv")
    duplicates = read_rows(source_dir / "duplicate_sell.csv")
    missions = read_rows(source_dir / "missions.csv")

    drop_tables = {}
    boxes = {}
    for row in chests:
        table = (row.get("drop_table") or "").strip()
        if table and table not in drop_tables:
            drop_tables[table] = {rarity: pct(row.get(rarity, "0")) for rarity in RARITIES}
        box_id = (row.get("box_id") or "").strip()
        if not box_id:
            continue
        box = {
            "rolls": int(number(row.get("rolls", "1")) or 1),
            "dropTable": table,
        }
        if row.get("price_type") == "caps":
            box["caps"] = int(number(row.get("price_value", "0")) or 0)
        boxes[box_id] = box

    return {
        "version": 1,
        "dropTables": drop_tables,
        "boxes": boxes,
        "weeklyRewards": [build_weekly_reward(row) for row in weekly if row.get("rank_label")],
        "duplicateSell": {
            row.get("rarity", "").strip(): number(row.get("multiplier_of_highest_upgrade_cost", "0"))
            for row in duplicates
            if row.get("rarity")
        },
        "missions": [
            build_mission(row)
            for row in missions
            if row.get("mission_id") and str(row.get("active", "")).strip().lower() != "no"
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", default="../data/sheet_template", help="Directory containing chests.csv, missions.csv, weekly_rewards.csv, duplicate_sell.csv")
    parser.add_argument("--out", default="../data/economy-missions.js")
    args = parser.parse_args()

    here = Path(__file__).resolve().parent
    source_dir = (here / args.source_dir).resolve()
    out = (here / args.out).resolve()
    config = build_config(source_dir)
    text = "window.MEGATON_ECONOMY_CONFIG = " + json.dumps(config, indent=2) + ";\n"
    out.write_text(text, encoding="utf-8")
    print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
