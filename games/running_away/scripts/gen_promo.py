#!/usr/bin/env python3
"""Generate Yandex-compliant promo art for Creature Hunt.

Calls the deployed image-gen worker for the base art, then composites
title/tagline text on top in PIL so the title is crisp at icon sizes.

Outputs:
  yandex_promo/en/icon_512x512.png
  yandex_promo/ru/icon_512x512.png        (same icon — title is just "CREATURE HUNT")
  yandex_promo/icon_maskable_512x512.png  (safe-zone padded variant)
  yandex_promo/en/cover_800x470.png       ("CREATURE HUNT" + "HIDE AND SEEK IN THE DARK")
  yandex_promo/ru/cover_800x470.png       ("CREATURE HUNT" + "ПРЯТКИ ВО ТЬМЕ")
"""
import json
import os
import subprocess
import sys
import time
import urllib.request
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PROMO = ROOT / "yandex_promo"
WORKER = "https://image-gen.timofeymarkin98.workers.dev/generate"
TOKEN_FILE = ROOT.parents[1] / "Shared" / "tools" / "image-gen-worker" / ".gen_token"
TOKEN = TOKEN_FILE.read_text().strip()

FONT_TITLE = "/System/Library/Fonts/Supplemental/Impact.ttf"
FONT_TAGLINE = "/System/Library/Fonts/Supplemental/Arial.ttf"

# Strong negative prompt to keep promo art clean for moderation
NEGATIVE = (
    "text, watermark, logo, signature, ui, hud, copyright, "
    "low quality, blurry, distorted, ugly, deformed"
)


def gen(prompt: str, width: int, height: int, steps: int = 6) -> Image.Image:
    payload = json.dumps({
        "prompt": prompt,
        "negative_prompt": NEGATIVE,
        "width": width,
        "height": height,
        "steps": steps,
        "model": "flux",
    }).encode()
    req = urllib.request.Request(
        WORKER, data=payload,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
            "User-Agent": "creature-hunt-promo/1.0",
            "Accept": "image/*, application/json",
        },
        method="POST",
    )
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                if r.status != 200:
                    raise RuntimeError(f"worker returned {r.status}: {r.read()[:200]}")
                return Image.open(BytesIO(r.read())).convert("RGB")
        except Exception as e:
            print(f"  attempt {attempt+1} failed: {e}", file=sys.stderr)
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def vignette(img: Image.Image, strength: float = 0.55) -> Image.Image:
    """Darken edges to push focus toward the centre / title overlay."""
    w, h = img.size
    mask = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(mask)
    d.ellipse((-w * 0.2, -h * 0.2, w * 1.2, h * 1.2), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(radius=max(w, h) // 4))
    dark = Image.new("RGB", (w, h), (0, 0, 0))
    return Image.composite(img, dark, mask.point(lambda v: int(v * strength + (1 - strength) * 255)))


def draw_text_with_glow(draw, xy, text, font, fill, glow=(255, 30, 30), glow_alpha=180):
    """Stroke + soft glow underneath the title (Yandex covers benefit from punch)."""
    # We fake a glow by drawing dilated copies on a separate alpha layer
    pass  # implemented inline in compose_cover/icon to keep PIL state simple


def compose_icon(out_path: Path, base: Image.Image, title_lines, font_size=92):
    """Compose icon — base art + bold title text overlay with red glow."""
    img = base.copy().resize((512, 512), Image.LANCZOS)
    img = vignette(img, 0.65)

    # Glow layer
    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    font = ImageFont.truetype(FONT_TITLE, font_size)
    line_h = int(font_size * 0.95)
    total_h = line_h * len(title_lines)
    y = (512 - total_h) // 2
    for line in title_lines:
        bbox = gd.textbbox((0, 0), line, font=font)
        tw = bbox[2] - bbox[0]
        x = (512 - tw) // 2
        # red glow halo
        for r in (8, 5, 3):
            gd.text((x, y), line, font=font, fill=(255, 40, 40, 180))
        y += line_h
    glow = glow.filter(ImageFilter.GaussianBlur(radius=10))
    img = Image.alpha_composite(img.convert("RGBA"), glow)

    # Solid title on top
    d = ImageDraw.Draw(img)
    y = (512 - total_h) // 2
    for line in title_lines:
        bbox = d.textbbox((0, 0), line, font=font)
        tw = bbox[2] - bbox[0]
        x = (512 - tw) // 2
        d.text((x, y), line, font=font, fill=(255, 80, 80, 255), stroke_width=3, stroke_fill=(0, 0, 0, 255))
        y += line_h

    img.convert("RGB").save(out_path, "PNG", optimize=True)
    print(f"  ✓ {out_path.relative_to(ROOT)}")


def compose_cover(out_path: Path, base: Image.Image, title: str, tagline: str):
    """800x470 cover with bold title + tagline. Bottom-aligned tagline."""
    img = base.copy().resize((800, 470), Image.LANCZOS)
    img = vignette(img, 0.55)

    title_font = ImageFont.truetype(FONT_TITLE, 88)
    tag_font = ImageFont.truetype(FONT_TAGLINE, 22)

    # Glow under title
    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    bbox = gd.textbbox((0, 0), title, font=title_font)
    tw = bbox[2] - bbox[0]
    x = (800 - tw) // 2
    y = 130
    gd.text((x, y), title, font=title_font, fill=(255, 40, 40, 220))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=18))
    img = Image.alpha_composite(img.convert("RGBA"), glow)

    d = ImageDraw.Draw(img)
    d.text((x, y), title, font=title_font, fill=(255, 90, 90, 255),
           stroke_width=4, stroke_fill=(0, 0, 0, 255))

    # Tagline
    bbox = d.textbbox((0, 0), tagline, font=tag_font)
    tw = bbox[2] - bbox[0]
    d.text(((800 - tw) // 2, 380), tagline, font=tag_font,
           fill=(220, 220, 220, 255), stroke_width=2, stroke_fill=(0, 0, 0, 255))

    img.convert("RGB").save(out_path, "PNG", optimize=True)
    print(f"  ✓ {out_path.relative_to(ROOT)}")


def main():
    PROMO.mkdir(exist_ok=True)
    (PROMO / "en").mkdir(exist_ok=True)
    (PROMO / "ru").mkdir(exist_ok=True)

    # ── 1. Icon base: creature in dark dungeon
    print("Generating icon base (creature in dungeon)...")
    icon_prompt = (
        "Dark dungeon corridor, glowing red eyes of a monster lurking in shadow, "
        "flickering torch on stone wall casting warm orange light, atmospheric horror, "
        "centered composition, dramatic chiaroscuro lighting, cinematic, painterly digital art, "
        "stone bricks, fog, no text, no UI, no humans"
    )
    icon_base = gen(icon_prompt, 1024, 1024)
    compose_icon(PROMO / "en" / "icon_512x512.png", icon_base, ["CREATURE", "HUNT"])
    # RU icon = same (game name stays English in icon for brand consistency)
    compose_icon(PROMO / "ru" / "icon_512x512.png", icon_base, ["CREATURE", "HUNT"])

    # ── 2. Maskable icon — must be readable when cropped to a circle
    # Yandex applies a circle mask so the safe zone is inner ~80%. We zoom in
    # on the same base image so important content is centered.
    print("Generating maskable icon (centered safe zone)...")
    maskable_base = icon_base.crop((128, 128, 896, 896)).resize((1024, 1024), Image.LANCZOS)
    compose_icon(PROMO / "icon_maskable_512x512.png", maskable_base,
                 ["CREATURE", "HUNT"], font_size=78)

    # ── 3. Cover EN — wider gameplay scene
    print("Generating cover base (wider dungeon scene)...")
    cover_prompt = (
        "Top-down view of a dark dungeon maze with stone corridors and rooms, "
        "small glowing torches scattered across rooms, a sinister monster silhouette "
        "in the shadows, tiny human figures hiding behind walls, atmospheric horror, "
        "cinematic dramatic lighting, painterly digital art, dark fantasy, "
        "no text, no UI overlay, wide aspect ratio"
    )
    cover_base = gen(cover_prompt, 1024, 576)  # ~16:9 then resized
    compose_cover(PROMO / "en" / "cover_800x470.png", cover_base,
                  "CREATURE HUNT", "HIDE AND SEEK IN THE DARK")
    compose_cover(PROMO / "ru" / "cover_800x470.png", cover_base,
                  "CREATURE HUNT", "ПРЯТКИ ВО ТЬМЕ")

    print("\nDone. Generated 5 PNGs.")


if __name__ == "__main__":
    main()
