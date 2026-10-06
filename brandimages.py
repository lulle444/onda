"""Writes the site's name into the emblem picture (hero-logo.webp).

rebrand.py runs this. hero-base.webp is the same picture with the name taken out.
The pools table on /yields (pools-table.webp) is finished artwork with the name already in it,
so after a rename it needs a new picture rather than this script.
"""
import os, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.abspath(__file__))
B = os.path.join(ROOT, "assets", "brand")
FONT = os.path.join(B, "montserrat-600.woff")


def fit(word, cap, maxw, track_em):
    size = cap * 2
    while True:
        f = ImageFont.truetype(FONT, size)
        bb = f.getbbox("H")
        if bb[3] - bb[1] <= cap: break
        size -= 1
    track = size * track_em
    width = lambda: sum(f.getlength(ch) for ch in word) + track * (len(word) - 1)
    while width() > maxw and track > 0: track -= .5
    while width() > maxw: size -= 1; f = ImageFont.truetype(FONT, size)
    return f, track, width()


def text_layer(size, word, f, track, x, top, fill):
    layer = Image.new("RGBA", size, (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    y = top - f.getbbox("H")[1]
    for ch in word:
        d.text((x, y), ch, font=f, fill=fill); x += f.getlength(ch) + track
    return layer


def hero(name):
    # the name on the glass plinth under the emblem, and its faint reflection in the water
    im = Image.open(os.path.join(B, "hero-base.webp")).convert("RGBA")
    word = name.upper(); top, cap = 277, 17
    f, track, w = fit(word, cap, 232, .40)
    layer = text_layer(im.size, word, f, track, 260 - w / 2, top, (14, 34, 70, 235)).filter(ImageFilter.GaussianBlur(.3))
    im = Image.alpha_composite(im, layer)
    refl = layer.crop((0, top - 2, im.width, top + cap + 3)).transpose(Image.FLIP_TOP_BOTTOM).filter(ImageFilter.GaussianBlur(1.1))
    refl.putalpha(refl.getchannel("A").point(lambda v: int(v * .45)))
    ref = Image.new("RGBA", im.size, (0, 0, 0, 0)); ref.paste(refl, (0, 331))
    Image.alpha_composite(im, ref).convert("RGB").save(os.path.join(B, "hero-logo.webp"), quality=90)



def run(name):
    hero(name)


if __name__ == "__main__":
    run(sys.argv[1])
