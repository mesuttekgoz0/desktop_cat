"""
Sahne görsellerini üretir:
  art/arka-plan-gunduz.png  ->  gündüz / akşam / gece arka planları
  art/esyalar.png           ->  yatak (arka + ön kenar), dolu/boş mama kabı, yumak
Çıktı: src/kedi/sahne-veri.js  (WebP data URI'leri)

Kullanım:  python tools/make_scene.py
Gerekli:   pillow, numpy, opencv-python
"""
import base64
import io
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
BG_SRC = ROOT / "art" / "arka-plan-gunduz.png"
PROPS_SRC = ROOT / "art" / "esyalar.png"
OUT = ROOT / "src" / "kedi" / "sahne-veri.js"

BG_SIZE = 560                    # yuva 140 css px; Retina + "Dev" boyutta bile keskin
# arka planda (kaynak px) üretici filigranı ve pencere camı
WATERMARK_BOX = (690, 935, 1012, 1002)
GLASS_BOX = (102, 118, 219, 373)
# eşya sayfasında (kaynak px) her eşyanın kutusu; yumakta yalnızca top (iplik dışarıda)
PROPS = {
    "bed":       {"box": (70, 140, 485, 430)},
    "bowlFull":  {"box": (645, 205, 890, 390)},
    "bowlEmpty": {"box": (150, 640, 390, 815)},
    "yarn":      {"circle": (740, 722, 62)},
}
# ekrandaki genişlikler (css px) ve saklama çözünürlüğü çarpanı
PROP_CSS_W = {"bed": 66, "bowlFull": 30, "bowlEmpty": 30, "yarn": 17}
PROP_RES = 3.5


def webp_uri(img, quality=86):
    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=quality, method=6)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode(), len(buf.getvalue())


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------ arka plan
def remove_watermark(rgb):
    x0, y0, x1, y1 = WATERMARK_BOX
    region = rgb[y0:y1, x0:x1].astype(np.int16)
    r, g, b = region[..., 0], region[..., 1], region[..., 2]
    white = (np.minimum(np.minimum(r, g), b) > 232)
    lime = (g > 190) & (b < 140) & (g - b > 80)
    mask = np.zeros(rgb.shape[:2], np.uint8)
    mask[y0:y1, x0:x1] = (white | lime).astype(np.uint8) * 255
    # rozetin içindeki koyu "AI" yazısı da gitsin: rozet kutusunu tümden doldur
    ys, xs = np.nonzero(mask[y0:y1, x0 + 240:x1])
    if len(xs):
        mask[y0 + ys.min():y0 + ys.max() + 1, x0 + 240 + xs.min():x0 + 240 + xs.max() + 1] = 255
    mask = cv2.dilate(mask, np.ones((7, 7), np.uint8))
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    out = cv2.inpaint(bgr, mask, 9, cv2.INPAINT_TELEA)
    return cv2.cvtColor(out, cv2.COLOR_BGR2RGB)


def glass_mask(rgb):
    """Pencere camı (gök + bulut) = kutunun içindeki, pembe/kahverengi olmayan pikseller."""
    x0, y0, x1, y1 = GLASS_BOX
    m = np.zeros(rgb.shape[:2], np.float32)
    reg = rgb[y0:y1, x0:x1].astype(np.int16)
    r, b = reg[..., 0], reg[..., 2]
    m[y0:y1, x0:x1] = (r - b < 28).astype(np.float32)
    return cv2.GaussianBlur(m, (3, 3), 0)


def sky(rgb, glass, top, bottom, cloud, moon=False, stars=False):
    """Camın içini yeni bir gökle boyar; bulut şekilleri soluk olarak korunur."""
    h, w = rgb.shape[:2]
    out = rgb.astype(np.float32)
    x0, y0, x1, y1 = GLASS_BOX
    yy = np.clip((np.arange(h) - y0) / (y1 - y0), 0, 1)[:, None, None]
    grad = np.array(top, np.float32) * (1 - yy) + np.array(bottom, np.float32) * yy
    grad = np.broadcast_to(grad, (h, w, 3)).copy()
    # bulutlar: kaynakta beyaza yakın alanlar
    whiteness = smoothstep(200, 245, rgb.min(axis=2).astype(np.float32))[..., None]
    grad = grad * (1 - whiteness * 0.55) + np.array(cloud, np.float32) * whiteness * 0.55
    if stars:
        rng = np.random.default_rng(7)
        for _ in range(9):
            sx, sy = rng.integers(x0 + 8, x1 - 8), rng.integers(y0 + 8, int(y0 + (y1 - y0) * 0.7))
            r = rng.uniform(1.2, 2.4)
            cv2.circle(grad, (int(sx), int(sy)), int(round(r)), (255, 248, 220), -1, cv2.LINE_AA)
    if moon:
        cx, cy, rad = x0 + 70, y0 + 62, 17
        yy2, xx2 = np.mgrid[0:h, 0:w]
        d = np.hypot(xx2 - cx, yy2 - cy)
        glow = np.exp(-((d / 55.0) ** 2))[..., None] * 0.35
        grad = grad * (1 - glow) + np.array([255, 240, 200], np.float32) * glow
        disk = smoothstep(rad + 1.2, rad - 1.2, d)
        bite = smoothstep(rad - 1.0, rad + 1.4, np.hypot(xx2 - (cx + 8), yy2 - (cy - 6)))
        crescent = (disk * bite)[..., None]
        grad = grad * (1 - crescent) + np.array([255, 241, 196], np.float32) * crescent
    g = glass[..., None]
    return out * (1 - g) + grad * g


def tint(img, mul, add=(0, 0, 0), glow=None):
    """Oda ışığı: renk çarpanı + isteğe bağlı pencereden gelen yumuşak ışık."""
    out = img * np.array(mul, np.float32) + np.array(add, np.float32)
    if glow:
        (gx, gy, gr, color, amount) = glow
        h, w = img.shape[:2]
        yy, xx = np.mgrid[0:h, 0:w]
        k = np.exp(-(((xx - gx) ** 2 + (yy - gy) ** 2) / (gr ** 2)))[..., None] * amount
        out = out * (1 - k) + np.array(color, np.float32) * k
    return out


def vignette(img, strength):
    h, w = img.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.hypot((xx - w / 2) / (w / 2), (yy - h * 0.45) / (h / 2))
    return img * (1 - strength * smoothstep(0.55, 1.35, d))[..., None]


def backgrounds():
    rgb = np.array(Image.open(BG_SRC).convert("RGB"))
    rgb = remove_watermark(rgb)
    glass = glass_mask(rgb)
    base = rgb.astype(np.float32)
    win = (160, 245)  # pencere merkezi (ışık kaynağı)

    day = vignette(base, 0.10)

    dusk = sky(rgb, glass, top=(236, 140, 150), bottom=(255, 205, 150), cloud=(255, 225, 205))
    dusk = tint(dusk, (1.0, 0.90, 0.84), glow=(win[0], win[1], 330, (255, 190, 140), 0.18))
    dusk = vignette(dusk, 0.16)

    night = sky(rgb, glass, top=(28, 34, 84), bottom=(64, 66, 128), cloud=(84, 88, 150), moon=True, stars=True)
    room = tint(night, (0.50, 0.52, 0.78), add=(6, 6, 16), glow=(win[0], win[1] + 120, 300, (150, 160, 230), 0.22))
    g = glass[..., None]
    night = room * (1 - g) + night * g          # gök kararmasın, oda kararsın
    night = vignette(night, 0.22)

    out = {}
    for name, arr in (("day", day), ("dusk", dusk), ("night", night)):
        img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).resize((BG_SIZE, BG_SIZE), Image.LANCZOS)
        uri, size = webp_uri(img, 84)
        out[name] = uri
        print(f"bg {name}: {size // 1024} KB")
    return out


# ------------------------------------------------------------------ eşyalar
def cut_prop(rgb, spec):
    h, w = rgb.shape[:2]
    if "circle" in spec:
        cx, cy, r = spec["circle"]
        box = (cx - r - 3, cy - r - 3, cx + r + 4, cy + r + 4)
    else:
        box = spec["box"]
    x0, y0, x1, y1 = box
    reg = rgb[y0:y1, x0:x1]
    # beyaz zemin: kenarlardan taşma dolgusu
    nonwhite = ~((reg.min(axis=2) > 236) & (reg.max(axis=2).astype(int) - reg.min(axis=2) < 16))
    ff = (~nonwhite).astype(np.uint8)
    mask = np.zeros((ff.shape[0] + 2, ff.shape[1] + 2), np.uint8)
    bg = np.zeros_like(ff)
    for sx, sy in ((0, 0), (ff.shape[1] - 1, 0), (0, ff.shape[0] - 1), (ff.shape[1] - 1, ff.shape[0] - 1)):
        if ff[sy, sx]:
            tmp = ff.copy() * 255
            cv2.floodFill(tmp, mask, (sx, sy), 128)
            bg |= (tmp == 128)
    alpha = (~bg.astype(bool)).astype(np.uint8) * 255
    if "circle" in spec:
        cx, cy, r = spec["circle"]
        circ = np.zeros_like(alpha)
        cv2.circle(circ, (cx - x0, cy - y0), r, 255, -1, cv2.LINE_AA)
        alpha = np.minimum(alpha, circ)
    alpha = cv2.erode(alpha, np.ones((3, 3), np.uint8))
    alpha = cv2.GaussianBlur(alpha, (3, 3), 0.8)
    rgba = np.dstack([reg, alpha])
    ys, xs = np.nonzero(alpha > 8)
    return rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def bed_front(rgba):
    """Yatağın ön kenarı: iç çukurun alt eğrisinin altında kalan kısım (kedinin önüne çizilir)."""
    h, w = rgba.shape[:2]
    rgb = rgba[..., :3].astype(np.int16)
    # iç çukur: pembe ve ortada
    pink = (rgb[..., 0] - rgb[..., 1] > 35) & (rgb[..., 0] > 200)
    pink[:, : w // 4] = False
    pink[:, w * 3 // 4:] = False
    pink[h * 2 // 3:, :] = False
    ys, xs = np.nonzero(pink)
    cx, cy = xs.mean(), ys.mean()
    rx, ry = (xs.max() - xs.min()) / 2, (ys.max() - ys.min()) / 2
    yy, xx = np.mgrid[0:h, 0:w]
    dx = np.clip(np.abs(xx - cx) / (rx * 1.6), 0, 1)
    edge = cy + ry * 1.1 * np.sqrt(1 - dx ** 2)          # çukurun alt eğrisi, yanlara doğru uzatılmış
    front = smoothstep(-2, 3, yy - edge)
    out = rgba.copy()
    out[..., 3] = (out[..., 3] * front).astype(np.uint8)
    return out


def props():
    rgb = np.array(Image.open(PROPS_SRC).convert("RGB"))
    out = {}
    for name, spec in PROPS.items():
        rgba = cut_prop(rgb, spec)
        parts = {name: rgba}
        if name == "bed":
            parts["bedFront"] = bed_front(rgba)
        for pname, arr in parts.items():
            css_w = PROP_CSS_W[name]
            img = Image.fromarray(arr, "RGBA")
            px_w = round(css_w * PROP_RES)
            img = img.resize((px_w, round(img.height * px_w / img.width)), Image.LANCZOS)
            uri, size = webp_uri(img, 88)
            out[pname] = {"src": uri, "w": css_w, "h": round(css_w * img.height / img.width, 2)}
            print(f"{pname}: {img.width}x{img.height} px -> {css_w}x{out[pname]['h']} css, {size // 1024} KB")
    return out


def main():
    data = {"bg": backgrounds(), **props()}
    OUT.write_text(
        "// Otomatik üretildi (tools/make_scene.py): oda arka planları ve eşyalar\n"
        "window.KEDI_SAHNE = " + json.dumps(data) + ";\n",
        encoding="utf-8", newline="\n",
    )
    print("yazıldı:", OUT.relative_to(ROOT))


if __name__ == "__main__":
    main()
