"""
Brand assets from the designer's logo (assets/brand/logo-source.png, 1254 px, black background).

  python3 -I apps/mobile/scripts/make-brand.py

1. Removes the red cross from the ambulance (docs/12 §2.3: the Red Cross / Red Crescent emblems are protected; never
   in our logo). The cross sits on the white van body: its box is refilled by interpolating the body on either side.
2. Writes the store/launcher icon, the Android adaptive icon (foreground, background, monochrome), the splash and the
   favicon. The RED logo is allowed only there (tokens: logo.red is never used inside the product).
3. Writes the in-app marks as white-on-transparent masks (mark-mono, logo-mono): the app tints them with the
   `logoMono` token, so inside the product the logo is single-colour (docs/06 §11).
Re-run after the designer delivers a cleaned vector; then replace this raster pipeline.
"""
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets/brand/logo-source.png"
IMG = ROOT / "assets/images"
BRAND = ROOT / "assets/brand"
WEB = ROOT.parent / "web"
DARK_BG = (0x0E, 0x11, 0x14)  # tokens color.dark.bg

# boxes in source pixels (1254 x 1254)
CROSS = (538, 623, 600, 685)  # x0, y0, x1, y1 inclusive
MARK = (330, 190, 900, 800)  # S-road + pin + van
FULL = (230, 190, 1030, 990)  # mark + wordmark


def remove_cross(im: Image.Image) -> Image.Image:
    im = im.copy()
    px = im.load()
    x0, y0, x1, y1 = CROSS
    for y in range(y0, y1 + 1):
        left, right = px[x0 - 2, y], px[x1 + 2, y]
        for x in range(x0, x1 + 1):
            t = (x - x0 + 1) / (x1 - x0 + 2)
            px[x, y] = tuple(int(left[i] * (1 - t) + right[i] * t) for i in range(3))
    patch = im.crop((x0 - 3, y0 - 3, x1 + 4, y1 + 4)).filter(ImageFilter.GaussianBlur(2))
    im.paste(patch.crop((3, 3, 3 + x1 - x0 + 1, 3 + y1 - y0 + 1)), (x0, y0))
    return im


def keyed(im: Image.Image) -> Image.Image:
    """black background → transparent; colour kept (alpha = brightest channel, colour un-premultiplied)."""
    rgba = Image.new("RGBA", im.size)
    src, dst = im.load(), rgba.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b = src[x, y]
            a = max(r, g, b)
            dst[x, y] = (0, 0, 0, 0) if a < 12 else (min(255, r * 255 // a), min(255, g * 255 // a), min(255, b * 255 // a), a)
    return rgba


def mono(im: Image.Image) -> Image.Image:
    """white silhouette, alpha from brightness: tinted in the app with logoMono."""
    k = keyed(im)
    alpha = k.getchannel("A")
    out = Image.new("RGBA", im.size, (255, 255, 255, 0))
    out.putalpha(alpha)
    return out


def fit(img: Image.Image, size: int, scale: float, bg=(0, 0, 0, 0)) -> Image.Image:
    """centre `img` in a size×size canvas, its longer side = scale·size"""
    canvas = Image.new("RGBA", (size, size), bg)
    w, h = img.size
    k = scale * size / max(w, h)
    small = img.resize((round(w * k), round(h * k)), Image.LANCZOS)
    canvas.alpha_composite(small, ((size - small.width) // 2, (size - small.height) // 2))
    return canvas


def main() -> None:
    clean = remove_cross(Image.open(SRC).convert("RGB"))
    clean.save(BRAND / "logo-clean.png")
    mark, full = clean.crop(MARK), clean.crop(FULL)
    mark_k, full_k = keyed(mark), keyed(full)

    fit(mark_k, 1024, 0.78, DARK_BG + (255,)).convert("RGB").save(IMG / "icon.png")
    # adaptive icon: the launcher masks to a circle/squircle; keep the mark inside the 66 % safe zone
    fit(mark_k, 512, 0.58).save(IMG / "android-icon-foreground.png")
    Image.new("RGBA", (512, 512), DARK_BG + (255,)).save(IMG / "android-icon-background.png")
    fit(mono(mark), 432, 0.58).save(IMG / "android-icon-monochrome.png")
    fit(full_k, 1024, 0.9).save(IMG / "splash-icon.png")
    fit(mark_k, 48, 0.9, DARK_BG + (255,)).save(IMG / "favicon.png")

    fit(mono(mark), 256, 1.0).save(BRAND / "mark-mono.png")
    fit(mono(full), 512, 1.0).save(BRAND / "logo-mono.png")

    # web console: the same mono mask (tinted with --najda-logo-mono) and the red icon for the tab / home screen
    icon = fit(mark_k, 512, 0.84, DARK_BG + (255,))
    fit(mono(mark), 256, 1.0).save(WEB / "public/brand/mark-mono.png")
    icon.convert("RGB").save(WEB / "src/app/icon.png")
    icon.resize((180, 180), Image.LANCZOS).convert("RGB").save(WEB / "src/app/apple-icon.png")
    icon.save(WEB / "src/app/favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    print("brand assets written")


if __name__ == "__main__":
    main()
