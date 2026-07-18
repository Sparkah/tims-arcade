#!/usr/bin/env python3
"""Verify the complete public dissertation pool before deployment."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


EXPECTED_GAMES = 56
BRIDGE_TAG = '<script src="/dissertation/study-bridge.js"></script>'
PRIVATE_KEYS = {
    "condition",
    "prompt",
    "prompt_id",
    "run",
    "run_id",
    "batch",
    "batch_id",
    "source",
    "source_path",
}


def load_json(path: Path) -> dict:
    value = json.loads(path.read_text())
    if not isinstance(value, dict):
        raise SystemExit(f"{path}: root must be an object")
    return value


def reject_private_keys(value: object, location: str = "root") -> None:
    if isinstance(value, dict):
        leaked = PRIVATE_KEYS.intersection(value)
        if leaked:
            raise SystemExit(f"{location}: private mapping key(s): {sorted(leaked)}")
        for key, child in value.items():
            reject_private_keys(child, f"{location}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            reject_private_keys(child, f"{location}[{index}]")


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    dissertation = root / "dissertation"
    pool = load_json(dissertation / "pool.json")
    integrity = load_json(dissertation / "integrity.json")
    reject_private_keys(pool, "pool")
    reject_private_keys(integrity, "integrity")

    pool_games = pool.get("games")
    integrity_games = integrity.get("games")
    if not isinstance(pool_games, list) or len(pool_games) != EXPECTED_GAMES:
        raise SystemExit(f"pool must contain exactly {EXPECTED_GAMES} games")
    if not isinstance(integrity_games, list) or len(integrity_games) != EXPECTED_GAMES:
        raise SystemExit(f"integrity manifest must contain exactly {EXPECTED_GAMES} games")

    integrity_by_id = {row.get("id"): row for row in integrity_games}
    if len(integrity_by_id) != EXPECTED_GAMES:
        raise SystemExit("integrity manifest contains duplicate or missing IDs")

    pool_ids: set[str] = set()
    for row in pool_games:
        public_id = row.get("id")
        public_path = row.get("path")
        if not isinstance(public_id, str) or public_id in pool_ids:
            raise SystemExit(f"invalid or duplicate public ID: {public_id!r}")
        expected_path = f"/dissertation/g/{public_id}/"
        if public_path != expected_path:
            raise SystemExit(f"{public_id}: invalid public path {public_path!r}")
        pool_ids.add(public_id)

        integrity_row = integrity_by_id.get(public_id)
        if not integrity_row or integrity_row.get("path") != expected_path:
            raise SystemExit(f"{public_id}: missing or mismatched integrity row")
        expected_hash = integrity_row.get("sha256")
        if not isinstance(expected_hash, str) or len(expected_hash) != 64:
            raise SystemExit(f"{public_id}: invalid SHA-256")

        game_path = dissertation / "g" / public_id / "index.html"
        if not game_path.is_file():
            raise SystemExit(f"{public_id}: missing {game_path}")
        content = game_path.read_bytes()
        if content.count(BRIDGE_TAG.encode()) != 1:
            raise SystemExit(f"{public_id}: study bridge must appear exactly once")
        actual_hash = hashlib.sha256(content).hexdigest()
        if actual_hash != expected_hash:
            raise SystemExit(f"{public_id}: served SHA-256 mismatch")

    actual_ids = {
        path.parent.name
        for path in (dissertation / "g").glob("*/index.html")
    }
    if actual_ids != pool_ids:
        raise SystemExit(
            "game directory set differs from pool: "
            f"missing={sorted(pool_ids - actual_ids)}, extra={sorted(actual_ids - pool_ids)}"
        )

    print(
        json.dumps(
            {
                "ok": True,
                "studyVersion": pool.get("studyVersion"),
                "games": len(pool_ids),
                "privateMappingKeys": 0,
            }
        )
    )


if __name__ == "__main__":
    main()
