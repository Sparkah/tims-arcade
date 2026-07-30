#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import subprocess
import tempfile
import unittest
from argparse import Namespace
from pathlib import Path
from unittest import mock

MODULE_PATH = Path(__file__).resolve().parents[1] / "indexnow_notify.py"
SPEC = importlib.util.spec_from_file_location("indexnow_notify", MODULE_PATH)
assert SPEC and SPEC.loader
indexnow = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(indexnow)


class IndexNowTests(unittest.TestCase):
    def test_first_run_uses_configured_rollout_base(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            repo = Path(temp)
            subprocess.run(["git", "init", "-q"], cwd=repo, check=True)
            subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=repo, check=True)
            subprocess.run(["git", "config", "user.name", "Test"], cwd=repo, check=True)
            (repo / "marker").write_text("base", encoding="utf-8")
            subprocess.run(["git", "add", "marker"], cwd=repo, check=True)
            subprocess.run(["git", "commit", "-qm", "base"], cwd=repo, check=True)
            base = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip()
            for value in ("middle", "target"):
                (repo / "marker").write_text(value, encoding="utf-8")
                subprocess.run(["git", "add", "marker"], cwd=repo, check=True)
                subprocess.run(["git", "commit", "-qm", value], cwd=repo, check=True)
            target = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip()

            args = Namespace(to_ref="HEAD", from_ref=None)
            with mock.patch.object(indexnow, "ROOT", repo):
                actual_base, actual_target = indexnow.resolve_range(
                    args,
                    {},
                    {"initialBaseCommit": base},
                )
            self.assertEqual(actual_base, base)
            self.assertEqual(actual_target, target)

    def test_retry_status_and_transport_rules(self) -> None:
        config = {
            "host": "game-factory.tech",
            "endpoint": "https://api.indexnow.org/indexnow",
        }
        with mock.patch.object(
            indexnow,
            "request_bytes",
            side_effect=[
                (429, b"", {"Retry-After": "0"}),
                (202, b"", {}),
            ],
        ), mock.patch.object(indexnow.time, "sleep") as sleeper:
            status = indexnow.submit_chunk(
                config, "a" * 32, "https://game-factory.tech/key.txt",
                ["https://game-factory.tech/"], 1, 2,
            )
        self.assertEqual(status, 202)
        sleeper.assert_called_once()

        with mock.patch.object(
            indexnow,
            "request_bytes",
            side_effect=[OSError("offline"), (200, b"", {})],
        ), mock.patch.object(indexnow.time, "sleep"):
            status = indexnow.submit_chunk(
                config, "a" * 32, "https://game-factory.tech/key.txt",
                ["https://game-factory.tech/"], 1, 2,
            )
        self.assertEqual(status, 200)

        with mock.patch.object(
            indexnow,
            "request_bytes",
            return_value=(403, b"", {}),
        ):
            with self.assertRaisesRegex(RuntimeError, "HTTP 403"):
                indexnow.submit_chunk(
                    config, "a" * 32, "https://game-factory.tech/key.txt",
                    ["https://game-factory.tech/"], 1, 2,
                )

    def test_plan_covers_changed_game_and_discovery_surfaces(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            repo = Path(temp)
            subprocess.run(["git", "init", "-q"], cwd=repo, check=True)
            subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=repo, check=True)
            subprocess.run(["git", "config", "user.name", "Test"], cwd=repo, check=True)
            source = [{
                "slug": "test_game",
                "title": "Test Game",
                "hook": "First",
                "genre": "arcade",
                "addedDate": "2026-07-01",
                "updatedDate": "2026-07-01",
                "published": True,
            }]
            (repo / "games.source.json").write_text(json.dumps(source), encoding="utf-8")
            (repo / "games.json").write_text(json.dumps(source), encoding="utf-8")
            (repo / "games" / "test_game").mkdir(parents=True)
            (repo / "games" / "test_game" / "index.html").write_text("v1", encoding="utf-8")
            subprocess.run(["git", "add", "games.source.json", "games.json", "games/test_game/index.html"], cwd=repo, check=True)
            subprocess.run(["git", "commit", "-qm", "base"], cwd=repo, check=True)
            base = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip()

            source[0]["hook"] = "Second"
            source[0]["updatedDate"] = "2026-07-30"
            (repo / "games.source.json").write_text(json.dumps(source), encoding="utf-8")
            (repo / "games.json").write_text(json.dumps(source), encoding="utf-8")
            (repo / "games" / "test_game" / "index.html").write_text("v2", encoding="utf-8")
            subprocess.run(["git", "add", "games.source.json", "games.json", "games/test_game/index.html"], cwd=repo, check=True)
            subprocess.run(["git", "commit", "-qm", "update"], cwd=repo, check=True)
            target = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip()

            with mock.patch.object(indexnow, "ROOT", repo):
                urls = indexnow.build_plan(base, target, "game-factory.tech")
            self.assertIn("https://game-factory.tech/p/test_game", urls)
            self.assertIn("https://game-factory.tech/p/test_game?lang=ru", urls)
            self.assertIn("https://game-factory.tech/sitemap.xml", urls)
            self.assertIn("https://game-factory.tech/genres", urls)
            self.assertTrue(all(url.startswith("https://game-factory.tech/") for url in urls))

    def test_live_key_must_match_exactly(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            key = "b" * 32
            (root / f"{key}.txt").write_text(f"{key}\n", encoding="utf-8")
            config = {
                "host": "game-factory.tech",
                "keyFile": f"{key}.txt",
                "endpoint": "https://api.indexnow.org/indexnow",
            }
            with mock.patch.object(indexnow, "ROOT", root), mock.patch.object(
                indexnow,
                "request_bytes",
                return_value=(200, key.encode(), {}),
            ):
                actual, location = indexnow.verify_live_key(config, 1)
            self.assertEqual(actual, key)
            self.assertEqual(location, f"https://game-factory.tech/{key}.txt")


if __name__ == "__main__":
    unittest.main()
