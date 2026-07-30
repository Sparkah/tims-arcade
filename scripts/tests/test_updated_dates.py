#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from unittest import mock

MODULE_PATH = Path(__file__).resolve().parents[1] / "check_updated_dates.py"
SPEC = importlib.util.spec_from_file_location("check_updated_dates", MODULE_PATH)
assert SPEC and SPEC.loader
updated_dates = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(updated_dates)


class UpdatedDateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.repo = Path(self.temp.name)
        subprocess.run(["git", "init", "-q"], cwd=self.repo, check=True)
        subprocess.run(["git", "config", "user.email", "test@example.com"], cwd=self.repo, check=True)
        subprocess.run(["git", "config", "user.name", "Test"], cwd=self.repo, check=True)
        self.row = {
            "slug": "test_game",
            "title": "Test Game",
            "hook": "First",
            "addedDate": "2026-07-01",
            "updatedDate": "2026-07-01",
            "published": True,
        }
        self._write()
        self.base = self._commit("base", "2026-07-01T12:00:00+00:00")

    def tearDown(self) -> None:
        self.temp.cleanup()

    def _write(self) -> None:
        (self.repo / "games.source.json").write_text(
            json.dumps([self.row]),
            encoding="utf-8",
        )

    def _commit(self, message: str, date: str) -> str:
        subprocess.run(["git", "add", "games.source.json"], cwd=self.repo, check=True)
        env = {**os.environ, "GIT_AUTHOR_DATE": date, "GIT_COMMITTER_DATE": date}
        subprocess.run(["git", "commit", "-qm", message], cwd=self.repo, env=env, check=True)
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"],
            cwd=self.repo,
            text=True,
        ).strip()

    def _run(self, target: str) -> tuple[int, str]:
        output = StringIO()
        with mock.patch.object(updated_dates, "ROOT", self.repo), mock.patch.object(
            sys,
            "argv",
            ["check_updated_dates.py", "--from", self.base, "--to", target],
        ), redirect_stdout(output):
            status = updated_dates.main()
        return status, output.getvalue()

    def test_valid_public_change_passes(self) -> None:
        self.row["hook"] = "Second"
        self.row["updatedDate"] = "2026-07-30"
        self._write()
        target = self._commit("valid update", "2026-07-30T12:00:00+00:00")
        status, output = self._run(target)
        self.assertEqual(status, 0, output)

    def test_added_date_is_immutable(self) -> None:
        self.row["addedDate"] = "2026-07-02"
        self.row["updatedDate"] = "2026-07-30"
        self._write()
        target = self._commit("rewrite launch date", "2026-07-30T12:00:00+00:00")
        status, output = self._run(target)
        self.assertEqual(status, 1)
        self.assertIn("addedDate is immutable", output)

    def test_invalid_calendar_date_is_rejected(self) -> None:
        self.row["updatedDate"] = "2026-02-31"
        self._write()
        target = self._commit("invalid date", "2026-07-30T12:00:00+00:00")
        status, output = self._run(target)
        self.assertEqual(status, 1)
        self.assertIn("requires updatedDate", output)

    def test_future_updated_date_is_rejected(self) -> None:
        self.row["updatedDate"] = "2099-01-01"
        self._write()
        target = self._commit("future date", "2026-07-30T12:00:00+00:00")
        status, output = self._run(target)
        self.assertEqual(status, 1)
        self.assertIn("after target commit date", output)


if __name__ == "__main__":
    unittest.main()
