#!/usr/bin/env python3
"""Regenerate Creature Hunt icons with proper-case title.

Fixes Yandex moderation rejection (2026-05-09 — draft 503759):
- §5.1.3: in-game title is "Creature Hunt" but icon said "CREATURE HUNT".
  Names must be IDENTICAL across game / draft / promo, including
  punctuation and case.

Re-uses the existing icon's dungeon backdrop (visible under the old text)
by Gaussian-blurring the source heavily, then re-rendering "Creature Hunt"
in Title Case on top. No external worker call.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
PROMO = ROOT / "yandex_promo"

FONT_PATH_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Impact.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
]


def font(size):
    for p in FONT_PATH_CANDIDATES:
        if Path(p).exists():
            try:
                return ImageFont.truetype(p, size)
            except OSError:
                continue
    return ImageFont.load_default()


def text_size(draw, txt, face):
    box = draw.textbbox((0, 0), txt, font=face)
    return box[2] - box[0], box[3] - box[1]


def render_icon(source_path, out_path):
    """Take a 512x512 source image, dim/blur it, overlay 'Creature Hunt'."""
    img = Image.open(source_path).convert("RGB")
    if img.size != (512, 512):
        img = img.resize((512, 512), Image.LANCZOS)
    # Blur heavily to wipe out any pre-existing title
    img = img.filter(ImageFilter.GaussianBlur(28))
    # Darken a touch so the title pops
    overlay = Image.new("RGB", img.size, (0, 0, 0))
    img = Image.blend(img, overlay, 0.32)

    # Render title — split across two lines to fit nicely
    draw = ImageDraw.Draw(img)
    title_face = font(94)
    line1 = "Creature"
    line2 = "Hunt"
    w1, h1 = text_size(draw, line1, title_face)
    w2, h2 = text_size(draw, line2, title_face)

    spacing = 4
    total_h = h1 + spacing + h2
    base_y = (512 - total_h) // 2 - 8

    # Stroke + fill for crisp readability
    stroke = 6
    text_color = (255, 71, 71)   # warm red, matches dungeon torch palette
    stroke_color = (40, 6, 6)

    draw.text(((512 - w1) / 2, base_y), line1, font=title_face,
              fill=text_color, stroke_width=stroke, stroke_fill=stroke_color)
    draw.text(((512 - w2) / 2, base_y + h1 + spacing), line2, font=title_face,
              fill=text_color, stroke_width=stroke, stroke_fill=stroke_color)

    img.save(out_path, "PNG")
    print(f"  ✓ {out_path.relative_to(ROOT)}")


def main():
    sources = [
        PROMO / "en" / "icon_512x512.png",
        PROMO / "ru" / "icon_512x512.png",
        PROMO / "icon_maskable_512x512.png",
    ]
    # Pick whichever source already exists as the backdrop reference
    backdrop = next((s for s in sources if s.exists()), None)
    if backdrop is None:
        raise SystemExit("No existing icon found to use as backdrop")

    print(f"Using backdrop: {backdrop.relative_to(ROOT)}")
    for out in sources:
        out.parent.mkdir(parents=True, exist_ok=True)
        render_icon(backdrop, out)
    print("Done.")


if __name__ == "__main__":
    main()
