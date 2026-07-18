#!/usr/bin/env python3
"""Build the blinded dissertation game pool from the frozen formal batches."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
from collections import Counter
from pathlib import Path


BATCHES = (
    "2026-07-06_13-01-07_E0_formal_6x5x3_batch1_orbit_tap",
    "2026-07-06_17-28-33_E0_formal_6x5x3_batch2_pattern_echo",
    "2026-07-06_21-57-41_E0_formal_6x5x3_batch3_gem_catch_sprint",
)
EXPECTED_FORMAL_RUNS = 90
EXPECTED_ELIGIBLE_RUNS = 56
STUDY_VERSION = "dissertation-player-v1"
SESSION_SIZE = 5
BRIDGE_TAG = '<script src="/dissertation/study-bridge.js"></script>'
TECHNICAL_EXCLUSIONS: dict[str, str] = {
    "gd1181d5b7e5d": (
        "core input throws before visible feedback or termination; "
        "confirmed by independent real-input runtime audit"
    ),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source-root",
        type=Path,
        default=os.environ.get("DISSERTATION_SOURCE_ROOT"),
        help="Root of qmul-agentic-game-production (or set DISSERTATION_SOURCE_ROOT).",
    )
    parser.add_argument(
        "--gallery-root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="Gallery checkout to populate.",
    )
    parser.add_argument(
        "--private-output-dir",
        type=Path,
        help=(
            "Private directory for the blinded mapping and D1 seed. Defaults "
            "inside the private dissertation source repository."
        ),
    )
    return parser.parse_args()


def sql_text(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def public_id(run_id: str) -> str:
    digest = hashlib.sha256(f"{STUDY_VERSION}|{run_id}".encode()).hexdigest()
    return f"g{digest[:12]}"


def inject_bridge(source: bytes, source_path: Path) -> bytes:
    text = source.decode("utf-8")
    lower = text.lower()
    if BRIDGE_TAG in text:
        return source
    head_end = lower.find("</head>")
    if head_end >= 0:
        text = text[:head_end] + f"  {BRIDGE_TAG}\n" + text[head_end:]
    else:
        body_end = lower.rfind("</body>")
        if body_end < 0:
            raise ValueError(f"{source_path} has neither </head> nor </body>")
        text = text[:body_end] + f"  {BRIDGE_TAG}\n" + text[body_end:]
    return text.encode("utf-8")


def load_rows(source_root: Path) -> tuple[list[dict], int, list[dict]]:
    rows: list[dict] = []
    technical_exclusions: list[dict] = []
    formal_count = 0
    seen_runs: set[str] = set()

    for batch_id in BATCHES:
        batch_dir = source_root / "artifacts" / "batches" / batch_id
        manifest = json.loads((batch_dir / "batch_manifest.json").read_text())
        notes = json.loads((batch_dir / "human_review_notes.json").read_text())["notes"]

        for run in manifest["runs"]:
            formal_count += 1
            run_id = Path(run["run_dir"]).name
            if run_id in seen_runs:
                raise ValueError(f"duplicate formal run: {run_id}")
            seen_runs.add(run_id)
            note = notes.get(run_id)
            if not note:
                raise ValueError(f"missing researcher note: {run_id}")
            if note["condition"] != run["team"] or note["prompt_id"] != run["prompt_id"]:
                raise ValueError(f"manifest/note mismatch: {run_id}")

            eligible = (
                note.get("sendToPlayers") == "yes"
                and note.get("playable") == "yes"
                and note.get("nonDegenerate") == "yes"
            )
            if not eligible:
                continue

            source_path = source_root / "runs" / run_id / "game" / "index.html"
            source = source_path.read_bytes()
            served = inject_bridge(source, source_path)
            opaque_id = public_id(run_id)
            candidate = {
                "public_id": opaque_id,
                "public_path": f"/dissertation/g/{opaque_id}/",
                "run_id": run_id,
                "condition": run["team"],
                "prompt_id": run["prompt_id"],
                "trial": int(run["repeat"]),
                "batch_id": batch_id,
                "source_path": str(source_path.relative_to(source_root)),
                "source_sha256": hashlib.sha256(source).hexdigest(),
                "served_sha256": hashlib.sha256(served).hexdigest(),
                "source_bytes": len(source),
                "_served": served,
            }
            if opaque_id in TECHNICAL_EXCLUSIONS:
                technical_exclusions.append(
                    {
                        **{
                            key: value
                            for key, value in candidate.items()
                            if key != "_served"
                        },
                        "reason": TECHNICAL_EXCLUSIONS[opaque_id],
                    }
                )
                continue
            rows.append(candidate)

    rows.sort(key=lambda row: row["public_id"])
    technical_exclusions.sort(key=lambda row: row["public_id"])
    return rows, formal_count, technical_exclusions


def write_outputs(
    gallery_root: Path,
    private_output_dir: Path,
    rows: list[dict],
    technical_exclusions: list[dict],
) -> None:
    dissertation_dir = gallery_root / "dissertation"
    game_dir = dissertation_dir / "g"
    if game_dir.exists():
        shutil.rmtree(game_dir)
    game_dir.mkdir(parents=True)

    for row in rows:
        target_dir = game_dir / row["public_id"]
        target_dir.mkdir()
        (target_dir / "index.html").write_bytes(row["_served"])

    public_pool = {
        "studyVersion": STUDY_VERSION,
        "sessionSize": SESSION_SIZE,
        "games": [
            {"id": row["public_id"], "path": row["public_path"]}
            for row in rows
        ],
    }
    (dissertation_dir / "pool.json").write_text(
        json.dumps(public_pool, indent=2) + "\n"
    )
    public_integrity = {
        "studyVersion": STUDY_VERSION,
        "games": [
            {
                "id": row["public_id"],
                "path": row["public_path"],
                "sha256": row["served_sha256"],
            }
            for row in rows
        ],
    }
    (dissertation_dir / "integrity.json").write_text(
        json.dumps(public_integrity, indent=2) + "\n"
    )

    private_rows = [
        {key: value for key, value in row.items() if key != "_served"}
        for row in rows
    ]
    private_output_dir.mkdir(parents=True, exist_ok=True)
    (private_output_dir / "pool_manifest.json").write_text(
        json.dumps(
            {
                "study_version": STUDY_VERSION,
                "selection_rule": (
                    "sendToPlayers=yes AND playable=yes AND nonDegenerate=yes, "
                    "then remove confirmed post-review technical-gate failures"
                ),
                "formal_runs": EXPECTED_FORMAL_RUNS,
                "eligible_runs": EXPECTED_ELIGIBLE_RUNS,
                "technical_exclusions": technical_exclusions,
                "games": private_rows,
            },
            indent=2,
        )
        + "\n"
    )

    values = []
    for row in rows:
        values.append(
            "("
            + ", ".join(
                (
                    sql_text(row["public_id"]),
                    sql_text(row["public_path"]),
                    sql_text(row["run_id"]),
                    sql_text(row["condition"]),
                    sql_text(row["prompt_id"]),
                    str(row["trial"]),
                    sql_text(row["batch_id"]),
                    sql_text(row["source_sha256"]),
                    sql_text(row["served_sha256"]),
                    "1",
                )
            )
            + ")"
        )
    seed_sql = (
        "-- Generated by scripts/build_dissertation_study.py. Do not hand-edit.\n"
        "UPDATE study_games SET active = 0;\n"
        "INSERT INTO study_games (\n"
        "  public_id, public_path, source_run_id, condition, prompt_id, trial,\n"
        "  batch_id, source_sha256, served_sha256, active\n"
        ") VALUES\n  "
        + ",\n  ".join(values)
        + "\nON CONFLICT(public_id) DO UPDATE SET\n"
        "  public_path=excluded.public_path,\n"
        "  source_run_id=excluded.source_run_id,\n"
        "  condition=excluded.condition,\n"
        "  prompt_id=excluded.prompt_id,\n"
        "  trial=excluded.trial,\n"
        "  batch_id=excluded.batch_id,\n"
        "  source_sha256=excluded.source_sha256,\n"
        "  served_sha256=excluded.served_sha256,\n"
        "  active=excluded.active;\n"
    )
    (private_output_dir / "0002_dissertation_games.sql").write_text(seed_sql)


def main() -> None:
    args = parse_args()
    if args.source_root is None:
        raise SystemExit("--source-root or DISSERTATION_SOURCE_ROOT is required")
    source_root = args.source_root.expanduser().resolve()
    gallery_root = args.gallery_root.expanduser().resolve()
    private_output_dir = (
        args.private_output_dir.expanduser().resolve()
        if args.private_output_dir
        else source_root / "artifacts" / "player_study" / STUDY_VERSION
    )
    rows, formal_count, technical_exclusions = load_rows(source_root)

    if formal_count != EXPECTED_FORMAL_RUNS:
        raise SystemExit(
            f"refusing build: expected {EXPECTED_FORMAL_RUNS} formal runs, got {formal_count}"
        )
    if len(rows) != EXPECTED_ELIGIBLE_RUNS:
        raise SystemExit(
            f"refusing build: expected {EXPECTED_ELIGIBLE_RUNS} eligible runs, got {len(rows)}"
        )
    if len({row["public_id"] for row in rows}) != len(rows):
        raise SystemExit("refusing build: opaque public ID collision")

    write_outputs(
        gallery_root,
        private_output_dir,
        rows,
        technical_exclusions,
    )
    conditions = dict(sorted(Counter(row["condition"] for row in rows).items()))
    prompts = dict(sorted(Counter(row["prompt_id"] for row in rows).items()))
    print(
        json.dumps(
            {
                "formal_runs": formal_count,
                "eligible_runs": len(rows),
                "technical_exclusions": len(technical_exclusions),
                "conditions": conditions,
                "prompts": prompts,
                "private_output_dir": str(private_output_dir),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
