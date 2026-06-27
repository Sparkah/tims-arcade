#!/usr/bin/env python3
"""Generate Gemini UI art for Megaton Arsenal boxes and paid bundles."""

from __future__ import annotations

import argparse
import base64
import json
import shutil
import sys
import time
import urllib.error
import urllib.request
from collections import deque
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path

from PIL import Image


SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parents[1]
MODEL = "gemini-3.1-flash-image"
ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions"
STYLE_REF = ROOT / "art_refs/gacha_collectibles_concept_01.png"
PAYLOAD_REF = SCRIPT_DIR / "gemini_vertical_payload_sheet.png"
OUT_ROOT = SCRIPT_DIR / "shop_visuals"
RAW_DIR = OUT_ROOT / "raw"
STAGE_DIR = OUT_ROOT / "processed"
REVIEW_SHEET = OUT_ROOT / "shop_visuals_review_sheet.png"
GAME_UI = ROOT / "game/assets/gacha/ui"
SIZE = 256


@dataclass(frozen=True)
class UiAsset:
    id: str
    group: str
    title: str
    description: str
    accent: str


ASSETS = [
    UiAsset("daily_drop", "boxes", "Daily Drop", "free small military-green payload crate with friendly glowing latch, one tiny cap charm, approachable common reward energy", "#54ff96"),
    UiAsset("caps_crate", "boxes", "Caps Crate", "blue steel vending-style crate stuffed with bottle caps and a glowing coin slot, chunky reinforced corners", "#5fd8ff"),
    UiAsset("premium_payload", "boxes", "Premium Payload", "purple premium arsenal case, chrome hinges, star-shaped seals, saturated rare glow leaking from the lid", "#b76dff"),
    UiAsset("premium_x10", "boxes", "Premium x10", "large golden bundle crate with ten tiny payload tubes, jackpot shine, rare-plus guarantee energy", "#ffd24a"),
    UiAsset("legendary_payload", "boxes", "Legendary Payload", "mythic red-and-gold arsenal case with a nuclear star latch, legendary-plus heat glow, crowned warhead tubes, premium final-boss reward energy", "#ff365e"),
    UiAsset("starter_cache", "products", "Starter Cache", "starter supply cache with caps, a small yield badge, lucky dice, and a compact upgrade toolkit", "#54ff96"),
    UiAsset("caps_pack", "products", "Caps Pack", "overflowing blue bottle-cap vault bag, cap stacks, chrome rim, energetic money burst", "#5fd8ff"),
    UiAsset("god_power", "products", "God Power", "mythic red nuclear button relic with halo, gold caps, overpowered lightning, final-boss premium artifact", "#ff365e"),
]


def read_key(env_file: Path) -> str:
    import os

    if os.environ.get("GEMINI_API_KEY"):
        return os.environ["GEMINI_API_KEY"].strip()
    if env_file.exists():
        for line in env_file.read_text(errors="ignore").splitlines():
            if line.startswith("GEMINI_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit(f"GEMINI_API_KEY not found in environment or {env_file}")


def b64_image(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("ascii")


def mime_for(path: Path) -> str:
    return "image/jpeg" if path.suffix.lower() in {".jpg", ".jpeg"} else "image/png"


def prompt_for(asset: UiAsset) -> str:
    return f"""Create one finished Megaton Arsenal shop UI asset.

Output:
- Single centered object on pure black #000000 background.
- Square 1:1 image, no text, no letters, no numbers, no labels, no UI chrome, no watermark, no scenery.
- Leave black margin around the object for alpha processing.

Subject:
- {asset.title}: {asset.description}
- Accent color anchor: {asset.accent}

Art direction:
- Same Google-generated Megaton gacha style as the references.
- Colorful juicy arcade collectible, chunky flat shading, bold near-black outline, saturated highlights.
- Must pop against dark green Pip-Boy gameplay UI.
- Readable at 56x56 and 128x128.
- Use real object silhouette, not an abstract icon.

Composition:
- Object fills about 78 percent of the canvas.
- Front-facing three-quarter UI collectible angle is OK for boxes/products.
- Keep edges crisp, simple, and game-ready."""


def extract_output_image(data: dict) -> bytes:
    img = data.get("output_image")
    if isinstance(img, dict) and img.get("data"):
        return base64.b64decode(img["data"])
    for step in data.get("steps", []):
        for part in step.get("content", []):
            if part.get("type") == "image" and part.get("data"):
                return base64.b64decode(part["data"])
    raise RuntimeError("Gemini response contained no image")


def call_gemini(key: str, asset: UiAsset, refs: list[Path], retries: int = 2) -> bytes:
    body = {
        "model": MODEL,
        "input": [{"type": "text", "text": prompt_for(asset)}]
        + [
            {"type": "image", "mime_type": mime_for(ref), "data": b64_image(ref)}
            for ref in refs
            if ref.exists()
        ],
        "response_format": {"type": "image", "mime_type": "image/jpeg", "aspect_ratio": "1:1"},
    }
    payload = json.dumps(body).encode()
    for attempt in range(retries + 1):
        req = urllib.request.Request(
            ENDPOINT,
            data=payload,
            headers={"Content-Type": "application/json", "x-goog-api-key": key},
        )
        try:
            with urllib.request.urlopen(req, timeout=180) as response:
                return extract_output_image(json.loads(response.read()))
        except urllib.error.HTTPError as exc:
            text = exc.read().decode("utf-8", "ignore")
            if attempt >= retries:
                raise RuntimeError(f"{asset.id}: HTTP {exc.code}: {text[:400]}") from exc
        except Exception as exc:
            if attempt >= retries:
                raise RuntimeError(f"{asset.id}: {exc}") from exc
        time.sleep(2 + attempt * 3)
    raise RuntimeError(f"{asset.id}: generation failed")


def is_edge_bg(r: int, g: int, b: int) -> bool:
    return max(r, g, b) < 32 or (min(r, g, b) > 226 and max(r, g, b) - min(r, g, b) < 48)


def edge_background_mask(img: Image.Image) -> tuple[bytearray, int, int]:
    rgb = img.convert("RGB")
    w, h = rgb.size
    px = rgb.load()
    seen = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()

    def add(x: int, y: int) -> None:
        idx = y * w + x
        if seen[idx]:
            return
        r, g, b = px[x, y]
        if is_edge_bg(r, g, b):
            seen[idx] = 1
            q.append((x, y))

    for x in range(w):
        add(x, 0)
        add(x, h - 1)
    for y in range(h):
        add(0, y)
        add(w - 1, y)
    while q:
        x, y = q.popleft()
        if x > 0:
            add(x - 1, y)
        if x + 1 < w:
            add(x + 1, y)
        if y > 0:
            add(x, y - 1)
        if y + 1 < h:
            add(x, y + 1)
    return seen, w, h


def content_bbox(img: Image.Image) -> tuple[int, int, int, int] | None:
    rgb = img.convert("RGB")
    px = rgb.load()
    mask, w, h = edge_background_mask(rgb)
    xs: list[int] = []
    ys: list[int] = []
    for y in range(h):
        for x in range(w):
            if mask[y * w + x]:
                continue
            r, g, b = px[x, y]
            if max(r, g, b) > 28:
                xs.append(x)
                ys.append(y)
    if not xs:
        return None
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


def process_image(src: Path, out_path: Path) -> None:
    img = Image.open(src).convert("RGBA")
    bbox = content_bbox(img)
    if bbox:
        pad = max(16, int(max(bbox[2] - bbox[0], bbox[3] - bbox[1]) * 0.08))
        img = img.crop(
            (
                max(0, bbox[0] - pad),
                max(0, bbox[1] - pad),
                min(img.width, bbox[2] + pad),
                min(img.height, bbox[3] + pad),
            )
        )
    img.thumbnail((SIZE, SIZE), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    out.alpha_composite(img, ((SIZE - img.width) // 2, (SIZE - img.height) // 2))
    edge_mask, w, h = edge_background_mask(out)
    pixels = []
    for idx, (r, g, b, a) in enumerate(out.getdata()):
        pixels.append((r, g, b, 0 if edge_mask[idx] or max(r, g, b) < 18 else a))
    out.putdata(pixels)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out.save(out_path)


def build_review(assets: list[UiAsset]) -> None:
    cols = 4
    rows = (len(assets) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * SIZE, rows * SIZE), (3, 16, 9, 255))
    for i, asset in enumerate(assets):
        path = STAGE_DIR / asset.group / f"{asset.id}.png"
        if path.exists():
            sheet.alpha_composite(Image.open(path).convert("RGBA"), ((i % cols) * SIZE, (i // cols) * SIZE))
    REVIEW_SHEET.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(REVIEW_SHEET)


def install_assets(assets: list[UiAsset]) -> None:
    for asset in assets:
        src = STAGE_DIR / asset.group / f"{asset.id}.png"
        if not src.exists():
            continue
        dst = GAME_UI / asset.group / f"{asset.id}.png"
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-file", type=Path, default=Path.home() / "Desktop/tokens-hack/.env")
    parser.add_argument("--ids", nargs="*")
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--install", action="store_true")
    args = parser.parse_args()

    by_id = {asset.id: asset for asset in ASSETS}
    selected = [by_id[item] for item in args.ids if item in by_id] if args.ids else ASSETS
    if not selected:
        raise SystemExit("No valid UI assets selected")

    key = read_key(args.env_file)
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    STAGE_DIR.mkdir(parents=True, exist_ok=True)
    pending = [asset for asset in selected if args.force or not (STAGE_DIR / asset.group / f"{asset.id}.png").exists()]

    print(f"Generating {len(pending)} Gemini shop visual(s) with {MODEL}...")
    refs = [STYLE_REF, PAYLOAD_REF]
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = {pool.submit(call_gemini, key, asset, refs): asset for asset in pending}
        for future in as_completed(futures):
            asset = futures[future]
            try:
                raw = future.result()
                raw_path = RAW_DIR / f"{asset.id}.jpg"
                raw_path.write_bytes(raw)
                process_image(raw_path, STAGE_DIR / asset.group / f"{asset.id}.png")
                print(f"ok {asset.id}")
            except Exception as exc:
                print(f"fail {asset.id}: {exc}", file=sys.stderr)
                return 1

    build_review(selected)
    if args.install:
        install_assets(selected)
        print(f"installed {GAME_UI}")
    print(f"review {REVIEW_SHEET}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
