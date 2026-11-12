"""
Dönüş karelerini üretir: art/kedi-donus-sayfasi.png  ->  src/kedi/donus-veri.js

Kaynak sayfada kediler beyaz zemin üzerinde yan yana duruyor. Zemin kenarlardan
taşma dolgusuyla (flood fill) bulunur, kalan bağlı bölgeler kedilerdir; istenen
görünüşler bölge merkezinin x konumuna göre seçilir.

Kullanım:  python tools/make_turn_sprites.py
Gerekli:   Pillow (pip install pillow)
"""
import base64
import io
import json
from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art" / "kedi-donus-sayfasi.png"
OUT = ROOT / "src" / "kedi" / "donus-veri.js"

LABEL_TOP = 760          # bu satırın altı yazılar; kediler üstte
# görünüş adı -> (bölge merkezinin yaklaşık x'i, kesim sınırı x_min)
# Ön görünüş yan komşusuna bıyıklarıyla yapışık; x_min ile ayrılır.
VIEWS = {"back": (116, None), "back34": (320, None), "front": (912, 812)}
# sayfa pikseli -> ekran (css) pikseli; uygulamadaki kediyle aynı boy (bkz. rig.js K)
SCALE = 0.164
WEBP_QUALITY = 88


def is_background(c):
    r, g, b = c
    return min(r, g, b) > 236 and max(r, g, b) - min(r, g, b) < 14


def main():
    img = Image.open(SRC).convert("RGB")
    w, h = img.width, LABEL_TOP
    px = img.load()

    # 1) zemin: kenarlardan taşma dolgusu
    bg = bytearray(w * h)
    q = deque([(x, 0) for x in range(w)] + [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)])
    while q:
        x, y = q.popleft()
        if not (0 <= x < w and 0 <= y < h):
            continue
        i = y * w + x
        if bg[i] or not is_background(px[x, y]):
            continue
        bg[i] = 1
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))

    # 2) bağlı bölgeler
    label = [0] * (w * h)
    comps = []
    for y0 in range(h):
        for x0 in range(w):
            i0 = y0 * w + x0
            if bg[i0] or label[i0]:
                continue
            n = len(comps) + 1
            label[i0] = n
            stack, count, box = [(x0, y0)], 0, [x0, y0, x0, y0]
            while stack:
                x, y = stack.pop()
                count += 1
                box = [min(box[0], x), min(box[1], y), max(box[2], x), max(box[3], y)]
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h:
                        j = ny * w + nx
                        if not bg[j] and not label[j]:
                            label[j] = n
                            stack.append((nx, ny))
            comps.append({"id": n, "count": count, "box": box})
    big = [c for c in comps if c["count"] > 2000]

    # 3) her görünüşü kes, kenarı yumuşat (beyaz hale kalmasın), webp'e çevir
    out = {}
    for name, (cx, x_min) in VIEWS.items():
        # x_min varsa bölge o sınırın sağında kalan kısmıdır (yapışık kediler)
        comp = min(big, key=lambda c: 0 if c["box"][0] <= cx <= c["box"][2] else abs((c["box"][0] + c["box"][2]) / 2 - cx))
        mask = Image.new("L", (w, h), 0)
        mp = mask.load()
        x0 = max(comp["box"][0], x_min or 0)
        for y in range(h):
            row = y * w
            for x in range(x0, comp["box"][2] + 1):
                if label[row + x] == comp["id"]:
                    mp[x, y] = 255
        mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
        rgba = img.crop((0, 0, w, h)).convert("RGBA")
        rgba.putalpha(mask)
        rgba = rgba.crop(mask.getbbox())
        buf = io.BytesIO()
        rgba.save(buf, "WEBP", quality=WEBP_QUALITY, method=6)
        out[name] = {
            "src": "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode(),
            "w": round(rgba.width * SCALE, 2),
            "h": round(rgba.height * SCALE, 2),
        }
        print(f"{name}: {rgba.width}x{rgba.height} px -> {out[name]['w']}x{out[name]['h']} css, {len(buf.getvalue()) // 1024} KB")

    OUT.write_text(
        "// Otomatik üretildi (tools/make_turn_sprites.py): dönüş kareleri, sağa bakan kedi için\n"
        "window.KEDI_DONUS = " + json.dumps(out) + ";\n",
        encoding="utf-8",
        newline="\n",
    )
    print("yazıldı:", OUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
