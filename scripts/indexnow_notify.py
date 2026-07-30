#!/usr/bin/env python3
"""Submit changed public Gallery URLs to IndexNow after production is live.

Default mode is a dry run. `--submit` verifies the public key file, posts
deduplicated same-host URLs in <=10,000 URL chunks, and advances durable state
only after every chunk is accepted.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "indexnow.config.json"
SLUG_RE = re.compile(r"^[a-z0-9_-]{1,64}$")
LOCALIZED_HOME = ("", "ru", "es", "pt", "tr", "ar")
GENRE_PATHS = (
    "/genres",
    "/genre/arcade",
    "/genre/puzzle",
    "/genre/strategy",
    "/genre/cleaning",
    "/genre/sort",
    "/genre/merge",
    "/genre/physics",
    "/genre/simulation",
    "/genre/word",
    "/genre/tycoon",
)
MAX_URLS = 10_000
PRIMARY_ENDPOINT = "https://api.indexnow.org/indexnow"
APPROVED_FALLBACK_ENDPOINTS = frozenset({
    "https://yandex.com/indexnow",
})


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
    return result.stdout.strip()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--submit", action="store_true", help="send requests and update state")
    parser.add_argument("--from", dest="from_ref", help="base git ref (default: last success or HEAD^)")
    parser.add_argument("--to", dest="to_ref", default="HEAD", help="target git ref")
    parser.add_argument("--timeout", type=float, default=15.0)
    parser.add_argument("--retries", type=int, default=3)
    return parser.parse_args()


def load_config() -> dict[str, Any]:
    raw = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    required = ("host", "keyFile", "endpoint")
    if not isinstance(raw, dict) or any(not isinstance(raw.get(key), str) for key in required):
        raise RuntimeError("indexnow.config.json is malformed")
    host = raw["host"].lower()
    if host != "game-factory.tech":
        raise RuntimeError("IndexNow host must be exactly game-factory.tech")
    if raw["endpoint"] != PRIMARY_ENDPOINT:
        raise RuntimeError("IndexNow primary endpoint must be the global endpoint")
    fallbacks = raw.get("fallbackEndpoints", [])
    if (
        not isinstance(fallbacks, list)
        or any(not isinstance(endpoint, str) for endpoint in fallbacks)
        or any(endpoint not in APPROVED_FALLBACK_ENDPOINTS for endpoint in fallbacks)
        or raw["endpoint"] in fallbacks
        or len(fallbacks) != len(set(fallbacks))
    ):
        raise RuntimeError("IndexNow fallbackEndpoints are malformed or not approved")
    initial_base = raw.get("initialBaseCommit", "")
    if initial_base and not re.fullmatch(r"[0-9a-f]{40}", initial_base):
        raise RuntimeError("IndexNow initialBaseCommit must be a full git SHA")
    root = ROOT.resolve()
    key_path = (root / raw["keyFile"]).resolve()
    if key_path.parent != root or not re.fullmatch(r"[a-z0-9-]{8,128}\.txt", key_path.name):
        raise RuntimeError("IndexNow keyFile must be a root .txt file")
    return raw


def state_path() -> Path:
    common = git("rev-parse", "--git-common-dir")
    path = Path(common)
    if not path.is_absolute():
        path = (ROOT / path).resolve()
    return path / "indexnow-state.json"


def load_state() -> dict[str, Any]:
    path = state_path()
    if not path.exists():
        return {}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        return raw if isinstance(raw, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def atomic_write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=".indexnow-state.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(value, stream, indent=2, sort_keys=True)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def resolve_range(
    args: argparse.Namespace,
    state: dict[str, Any],
    config: dict[str, Any],
) -> tuple[str, str]:
    target = git("rev-parse", args.to_ref)
    if args.from_ref:
        base = git("rev-parse", args.from_ref)
    else:
        state_candidate = state.get("last_success_commit")
        config_candidate = config.get("initialBaseCommit")
        candidate = (
            state_candidate if isinstance(state_candidate, str) and state_candidate
            else config_candidate if isinstance(config_candidate, str)
            else ""
        )
        if candidate:
            result = subprocess.run(
                ["git", "merge-base", "--is-ancestor", candidate, target],
                cwd=ROOT,
                check=False,
                env=clean_git_env(),
            )
            base = candidate if result.returncode == 0 else ""
        else:
            base = ""
        if not base:
            base = git("rev-parse", f"{target}^", check=False)
            if not base:
                base = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"  # Git's empty tree
    return base, target


def json_at(ref: str, path: str) -> list[dict[str, Any]]:
    text = git("show", f"{ref}:{path}", check=False)
    if not text:
        return []
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        return []
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def game_map(ref: str) -> dict[str, dict[str, Any]]:
    return {
        item["slug"]: item
        for item in json_at(ref, "games.json")
        if isinstance(item.get("slug"), str) and SLUG_RE.fullmatch(item["slug"])
    }


def changed_names(base: str, target: str) -> set[str]:
    output = git("diff", "--name-only", f"{base}..{target}", "--")
    return {line for line in output.splitlines() if line}


def changed_slugs_from_paths(paths: set[str]) -> set[str]:
    slugs: set[str] = set()
    for path in paths:
        match = re.match(r"^games/([^/]+)/", path)
        if match and SLUG_RE.fullmatch(match.group(1)):
            slugs.add(match.group(1))
            continue
        match = re.match(r"^(?:thumbs|previews)/([^/.]+?)(?:__v\d+)?\.(?:png|webp|webm)$", path)
        if match and SLUG_RE.fullmatch(match.group(1)):
            slugs.add(match.group(1))
    return slugs


def build_plan(base: str, target: str, host: str) -> list[str]:
    old_games = game_map(base)
    new_games = game_map(target)
    paths = changed_names(base, target)
    slugs = changed_slugs_from_paths(paths)
    slugs.update(
        slug
        for slug in old_games.keys() | new_games.keys()
        if old_games.get(slug) != new_games.get(slug)
    )

    global_page_template = any(
        path == "functions/p/[slug].js"
        or path.startswith("functions/_lib/seoSurface.")
        for path in paths
    )
    if global_page_template:
        slugs.update(old_games)
        slugs.update(new_games)

    urls: set[str] = set()

    home_changed = bool(paths & {
        "index.html",
        "app.js",
        "games.json",
        "games.source.json",
        "functions/index.js",
        "functions/games.json.js",
        "functions/_lib/publicCatalogue.js",
        "functions/_lib/seoSurface.js",
        "llms.txt",
        "sitemap.xml",
        "rss.xml",
    }) or bool(slugs)
    if home_changed:
        for lang in LOCALIZED_HOME:
            suffix = "" if not lang else f"?lang={lang}"
            urls.add(f"https://{host}/{suffix}")
        urls.update({
            f"https://{host}/games.json",
            f"https://{host}/llms.txt",
            f"https://{host}/sitemap.xml",
            f"https://{host}/rss.xml",
        })
        urls.update(f"https://{host}{path}" for path in GENRE_PATHS)

    for slug in slugs:
        urls.add(f"https://{host}/p/{slug}")
        urls.add(f"https://{host}/p/{slug}?lang=ru")

    for url in urls:
        parsed = urllib.parse.urlsplit(url)
        if (
            parsed.scheme != "https"
            or parsed.hostname != host
            or parsed.username
            or parsed.password
            or parsed.port
            or parsed.fragment
        ):
            raise RuntimeError(f"refusing off-host or malformed URL: {url}")
    return sorted(urls)


def request_bytes(request: urllib.request.Request, timeout: float) -> tuple[int, bytes, dict[str, str]]:
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read(), dict(response.headers.items())
    except urllib.error.HTTPError as error:
        return error.code, error.read(), dict(error.headers.items())


def verify_live_key(config: dict[str, Any], timeout: float) -> tuple[str, str]:
    key_path = ROOT / config["keyFile"]
    key = key_path.read_text(encoding="utf-8").strip()
    if not re.fullmatch(r"[a-z0-9-]{8,128}", key) or key_path.name != f"{key}.txt":
        raise RuntimeError("local IndexNow key file is invalid")
    location = f"https://{config['host']}/{config['keyFile']}"
    request = urllib.request.Request(location, headers={"User-Agent": "TimGameLab-IndexNow/1.0"})
    status, body, _ = request_bytes(request, timeout)
    if status != 200 or body.decode("utf-8", "replace").strip() != key:
        raise RuntimeError(f"live IndexNow key verification failed (HTTP {status})")
    return key, location


def submit_chunk(
    config: dict[str, Any],
    key: str,
    key_location: str,
    urls: list[str],
    timeout: float,
    retries: int,
    endpoint: str,
) -> int:
    payload = json.dumps({
        "host": config["host"],
        "key": key,
        "keyLocation": key_location,
        "urlList": urls,
    }).encode("utf-8")
    request = urllib.request.Request(
        endpoint,
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "User-Agent": "TimGameLab-IndexNow/1.0",
        },
    )
    retryable = {429, 500, 502, 503, 504}
    for attempt in range(retries + 1):
        try:
            status, body, headers = request_bytes(request, timeout)
        except (OSError, urllib.error.URLError) as error:
            if attempt >= retries:
                raise RuntimeError(f"IndexNow transport failed: {error}") from error
            time.sleep(min(8.0, 2.0 ** attempt))
            continue
        if status in (200, 202):
            return status
        if status not in retryable or attempt >= retries:
            detail = body.decode("utf-8", "replace").strip()
            if len(detail) > 500:
                detail = f"{detail[:497]}..."
            suffix = f": {detail}" if detail else ""
            raise RuntimeError(
                f"IndexNow endpoint {endpoint} rejected URL batch "
                f"with HTTP {status}{suffix}"
            )
        retry_after = headers.get("Retry-After", "")
        delay = min(30.0, float(retry_after)) if retry_after.isdigit() else min(8.0, 2.0 ** attempt)
        time.sleep(delay)
    raise RuntimeError("IndexNow retry loop exhausted")


def submit_urls(
    config: dict[str, Any],
    key: str,
    key_location: str,
    urls: list[str],
    timeout: float,
    retries: int,
) -> tuple[list[int], str]:
    endpoints = [config["endpoint"], *config.get("fallbackEndpoints", [])]
    for endpoint_index, endpoint in enumerate(endpoints):
        statuses: list[int] = []
        try:
            for offset in range(0, len(urls), MAX_URLS):
                statuses.append(submit_chunk(
                    config,
                    key,
                    key_location,
                    urls[offset:offset + MAX_URLS],
                    timeout,
                    retries,
                    endpoint,
                ))
        except RuntimeError as error:
            if endpoint_index + 1 >= len(endpoints):
                raise
            print(
                f"[indexnow] endpoint failed; trying approved fallback: {error}",
                file=sys.stderr,
            )
            continue
        return statuses, endpoint
    raise RuntimeError("IndexNow endpoints exhausted without acceptance")


def main() -> int:
    args = parse_args()
    config = load_config()
    state = load_state()
    base, target = resolve_range(args, state, config)
    urls = build_plan(base, target, config["host"])
    mode = "SUBMIT" if args.submit else "DRY RUN"
    print(f"[indexnow] {mode}: {base[:12]}..{target[:12]} -> {len(urls)} URL(s)")
    for url in urls[:30]:
        print(f"  {url}")
    if len(urls) > 30:
        print(f"  ... {len(urls) - 30} more")
    if not args.submit:
        return 0

    if not urls:
        atomic_write_json(state_path(), {
            "last_success_commit": target,
            "last_success_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "url_count": 0,
        })
        return 0

    key, key_location = verify_live_key(config, args.timeout)
    statuses, accepted_endpoint = submit_urls(
        config,
        key,
        key_location,
        urls,
        args.timeout,
        max(0, args.retries),
    )
    atomic_write_json(state_path(), {
        "last_success_commit": target,
        "last_success_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "url_count": len(urls),
        "statuses": statuses,
        "endpoint": accepted_endpoint,
    })
    print(
        f"[indexnow] accepted {len(urls)} URL(s) via "
        f"{accepted_endpoint}: {statuses}"
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError, ValueError) as error:
        print(f"[indexnow] ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
