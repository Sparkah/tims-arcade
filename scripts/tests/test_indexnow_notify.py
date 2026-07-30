#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import os
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


def git_run(repo: Path, *args: str) -> None:
    subprocess.run(
        ["git", *args],
        cwd=repo,
        env=indexnow.clean_git_env(),
        check=True,
    )


def git_output(repo: Path, *args: str) -> str:
    return subprocess.check_output(
        ["git", *args],
        cwd=repo,
        env=indexnow.clean_git_env(),
        text=True,
    ).strip()


class IndexNowTests(unittest.TestCase):
    def test_first_run_uses_configured_rollout_base(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            repo = Path(temp)
            git_run(repo, "init", "-q")
            git_run(repo, "config", "user.email", "test@example.com")
            git_run(repo, "config", "user.name", "Test")
            (repo / "marker").write_text("base", encoding="utf-8")
            git_run(repo, "add", "marker")
            git_run(repo, "commit", "-qm", "base")
            base = git_output(repo, "rev-parse", "HEAD")
            for value in ("middle", "target"):
                (repo / "marker").write_text(value, encoding="utf-8")
                git_run(repo, "add", "marker")
                git_run(repo, "commit", "-qm", value)
            target = git_output(repo, "rev-parse", "HEAD")

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
                config["endpoint"],
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
                config["endpoint"],
            )
        self.assertEqual(status, 200)

        with mock.patch.object(
            indexnow,
            "request_bytes",
            return_value=(
                403,
                b'{"errorCode":"UserForbiddedToAccessSite","message":"verify the site"}',
                {},
            ),
        ):
            with self.assertRaisesRegex(
                RuntimeError,
                r"HTTP 403.*UserForbiddedToAccessSite.*verify the site",
            ):
                indexnow.submit_chunk(
                    config, "a" * 32, "https://game-factory.tech/key.txt",
                    ["https://game-factory.tech/"], 1, 2,
                    config["endpoint"],
                )

    def test_config_accepts_only_strict_official_fallbacks(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            key = "c" * 32
            (root / f"{key}.txt").write_text(f"{key}\n", encoding="utf-8")
            config_path = root / "indexnow.config.json"
            config_path.write_text(json.dumps({
                "host": "game-factory.tech",
                "keyFile": f"{key}.txt",
                "endpoint": "https://api.indexnow.org/indexnow",
                "fallbackEndpoints": ["https://yandex.com/indexnow"],
            }), encoding="utf-8")
            with mock.patch.object(indexnow, "ROOT", root), mock.patch.object(
                indexnow,
                "CONFIG_PATH",
                config_path,
            ):
                loaded = indexnow.load_config()
                self.assertEqual(
                    loaded["fallbackEndpoints"],
                    ["https://yandex.com/indexnow"],
                )
                config_path.write_text(json.dumps({
                    **loaded,
                    "fallbackEndpoints": ["https://example.com/indexnow"],
                }), encoding="utf-8")
                with self.assertRaisesRegex(RuntimeError, "not approved"):
                    indexnow.load_config()
                config_path.write_text(json.dumps({
                    **loaded,
                    "endpoint": "https://yandex.com/indexnow",
                    "fallbackEndpoints": ["https://api.indexnow.org/indexnow"],
                }), encoding="utf-8")
                with self.assertRaisesRegex(RuntimeError, "global endpoint"):
                    indexnow.load_config()

    def test_submission_falls_back_to_approved_yandex_endpoint(self) -> None:
        config = {
            "host": "game-factory.tech",
            "endpoint": "https://api.indexnow.org/indexnow",
            "fallbackEndpoints": ["https://yandex.com/indexnow"],
        }
        responses = [
            (
                403,
                b'{"errorCode":"UserForbiddedToAccessSite"}',
                {},
            ),
            (200, b"", {}),
        ]
        with mock.patch.object(
            indexnow,
            "request_bytes",
            side_effect=responses,
        ):
            statuses, endpoint = indexnow.submit_urls(
                config,
                "a" * 32,
                "https://game-factory.tech/key.txt",
                ["https://game-factory.tech/"],
                1,
                0,
            )
        self.assertEqual(statuses, [200])
        self.assertEqual(endpoint, "https://yandex.com/indexnow")

    def test_plan_covers_changed_game_and_discovery_surfaces(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            repo = Path(temp)
            git_run(repo, "init", "-q")
            git_run(repo, "config", "user.email", "test@example.com")
            git_run(repo, "config", "user.name", "Test")
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
            git_run(repo, "add", "games.source.json", "games.json", "games/test_game/index.html")
            git_run(repo, "commit", "-qm", "base")
            base = git_output(repo, "rev-parse", "HEAD")

            source[0]["hook"] = "Second"
            source[0]["updatedDate"] = "2026-07-30"
            (repo / "games.source.json").write_text(json.dumps(source), encoding="utf-8")
            (repo / "games.json").write_text(json.dumps(source), encoding="utf-8")
            (repo / "games" / "test_game" / "index.html").write_text("v2", encoding="utf-8")
            git_run(repo, "add", "games.source.json", "games.json", "games/test_game/index.html")
            git_run(repo, "commit", "-qm", "update")
            target = git_output(repo, "rev-parse", "HEAD")

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

    def test_git_helper_ignores_poisoned_hook_environment(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            repo = Path(temp)
            git_run(repo, "init", "-q")
            git_run(repo, "config", "user.email", "test@example.com")
            git_run(repo, "config", "user.name", "Test")
            (repo / "marker").write_text("safe", encoding="utf-8")
            git_run(repo, "add", "marker")
            git_run(repo, "commit", "-qm", "safe")
            expected = git_output(repo, "rev-parse", "HEAD")
            poison = {
                "GIT_DIR": str(repo / "wrong-git-dir"),
                "GIT_WORK_TREE": str(repo / "wrong-work-tree"),
                "GIT_INDEX_FILE": str(repo / "wrong-index"),
            }
            with mock.patch.dict(os.environ, poison, clear=False), mock.patch.object(
                indexnow,
                "ROOT",
                repo,
            ):
                self.assertEqual(indexnow.git("rev-parse", "HEAD"), expected)


if __name__ == "__main__":
    unittest.main()
