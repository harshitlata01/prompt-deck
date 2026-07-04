"""Generates PromptDeck extension icons (16/48/128 px).

Draws at 8x supersample then downsamples for clean anti-aliasing.
Run once locally with Pillow; output PNGs are committed, this script is not
needed at runtime. Kept out of the shipped extension via .gitignore-style
exclusion is unnecessary since it's harmless, but we remove it after running.
"""

from PIL import Image, ImageDraw, ImageFont

SCALE = 8
SIZES = [16, 48, 128]

BG = (10, 10, 10, 255)          # near-black
CARD = (30, 30, 30, 255)        # stacked "slide" bars
YELLOW = (245, 194, 66, 255)    # accent
GREEN = (0, 232, 122, 255)      # "sent" dot


def make_icon(size):
    s = size * SCALE
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # rounded square background
    radius = int(s * 0.22)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=radius, fill=BG)

    # two receding "slide" bars (deck) behind the main glyph
    bar_h = int(s * 0.10)
    for i, w_frac in enumerate([0.46, 0.58]):
        y = int(s * (0.24 + i * 0.14))
        w = int(s * w_frac)
        x = (s - w) // 2
        d.rounded_rectangle(
            [x, y, x + w, y + bar_h], radius=bar_h // 2, fill=CARD
        )

    # bold yellow forward chevron ("send / next prompt")
    cx, cy = s * 0.5, s * 0.62
    r = s * 0.16
    d.polygon(
        [
            (cx - r, cy - r * 1.15),
            (cx - r, cy + r * 1.15),
            (cx + r * 1.1, cy),
        ],
        fill=YELLOW,
    )

    # small green "done" dot, top-right
    dot_r = s * 0.075
    dot_cx, dot_cy = s * 0.80, s * 0.20
    d.ellipse(
        [dot_cx - dot_r, dot_cy - dot_r, dot_cx + dot_r, dot_cy + dot_r],
        fill=GREEN,
    )

    return img.resize((size, size), Image.LANCZOS)


for size in SIZES:
    icon = make_icon(size)
    icon.save(f"icon{size}.png")
    print(f"wrote icon{size}.png")
