#!/usr/bin/env python3
"""Post-process raw 1720x1240 (canvas @ 2x DPR) gameplay frames into
Yandex-spec 1600x900 promo screenshots.

For each raw frame:
  1. Crop the player-centered 16:9 region (canvas center, with the lit torch
     area filling the frame).
  2. Resize with Lanczos to 1600x900.
  3. Save as final desktop_N.png / mobile_N.png.

Output: yandex_promo/{en,ru}/desktop_1.png, desktop_2.png, mobile_1.png, mobile_2.png
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "yandex_promo" / "_raw"
TARGET_W, TARGET_H = 1600, 900
TARGET_RATIO = TARGET_W / TARGET_H  # 1.778

# Map of raw frame → final filename (single source for all 4 scenes)
SCENES = {
    "1_survivor_explore": "desktop_1",
    "2_survivor_sprint":  "desktop_2",
    "3_creature_hunt":    "mobile_1",
    "4_creature_move":    "mobile_2",
}


def smart_crop(img: Image.Image) -> Image.Image:
    """Crop to 16:9 centered on canvas center.

    Source frame is the canvas at deviceScaleFactor=2, so 1720x1240 (or
    whatever puppeteer captured). Center crop a 16:9 window slightly larger
    than the player's torchlit area so the bright gameplay fills the frame.
    """
    w, h = img.size
    src_ratio = w / h
    if src_ratio > TARGET_RATIO:
        # source wider than 16:9 — crop horizontally
        new_w = int(h * TARGET_RATIO)
        x = (w - new_w) // 2
        return img.crop((x, 0, x + new_w, h))
    else:
        # source taller than 16:9 — top-align the crop so the HUD text in the
        # top-left corner stays fully visible. Yandex's rule 8.3 prohibits
        # truncated text in icons/covers, and "good quality" generally — a
        # half-clipped HUD reads as a broken interface to a moderator.
        new_h = int(w / TARGET_RATIO)
        return img.crop((0, 0, w, new_h))


def main():
    out_en = ROOT / "yandex_promo" / "en"
    out_ru = ROOT / "yandex_promo" / "ru"
    out_en.mkdir(parents=True, exist_ok=True)
    out_ru.mkdir(parents=True, exist_ok=True)

    for lang in ("en", "ru"):
        print(f"── {lang.upper()} ──")
        for scene_key, final_name in SCENES.items():
            raw = RAW / f"{lang}_{scene_key}.png"
            if not raw.exists():
                print(f"  ⚠ missing: {raw.name}")
                continue
            img = Image.open(raw).convert("RGB")
            img = smart_crop(img)
            img = img.resize((TARGET_W, TARGET_H), Image.LANCZOS)
            out_dir = out_en if lang == "en" else out_ru
            out_path = out_dir / f"{final_name}.png"
            img.save(out_path, "PNG", optimize=True)
            print(f"  ✓ yandex_promo/{lang}/{final_name}.png")
    print("\n8 final screenshots written.")


if __name__ == "__main__":
    main()
