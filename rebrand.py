"""Renames the whole site in one go: name, wordmark, address, X account, Telegram bot and database key prefix.

Edit brand.json, then run  python3 rebrand.py  and commit the result.
.brand-current.json remembers what the site is called now, so running it again after another change works too.
"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

ROOT = os.path.dirname(os.path.abspath(__file__))
NEW = json.load(open(os.path.join(ROOT, "brand.json"), encoding="utf-8"))
CUR_F = os.path.join(ROOT, ".brand-current.json")
CUR = json.load(open(CUR_F, encoding="utf-8"))
FIELDS = ["name", "slug", "wordmark", "host", "apex", "x", "telegram", "prefix"]
miss = [k for k in FIELDS if not NEW.get(k)]
if miss: sys.exit("brand.json is missing: " + ", ".join(miss))
if NEW["telegram"].lower() == "usetidewatch_bot" and NEW["name"] != "Tidewatch":
    sys.exit("This copy must have its own Telegram bot, never @Usetidewatch_bot.")
if NEW["prefix"] == "tw" and NEW["name"] != "Tidewatch":
    sys.exit("Pick a database key prefix other than tw, so the copy never touches Tidewatch's alerts or leaderboard.")

c, n = CUR, NEW
PAIRS = [   # order matters: longer, more specific strings first
    ("https://" + c["host"], "https://" + n["host"]),
    ("https://" + c["apex"], "https://" + n["host"]),
    (c["host"], n["host"]), (c["apex"], n["host"]),
    ("t.me/" + c["telegram"], "t.me/" + n["telegram"]), ('"' + c["telegram"] + '"', '"' + n["telegram"] + '"'), ("@" + c["telegram"], "@" + n["telegram"]),
    ("x.com/" + c["x"], "x.com/" + n["x"]), ("@" + c["x"], "@" + n["x"]),
    (f'{c["wordmark"][0]}<b>{c["wordmark"][1]}</b>', f'{n["wordmark"][0]}<b>{n["wordmark"][1]}</b>'),
    (f'"{c["wordmark"][0]}", h({{color: C.accent}}, "{c["wordmark"][1]}")', f'"{n["wordmark"][0]}", h({{color: C.accent}}, "{n["wordmark"][1]}")'),
    (c["name"], n["name"]), (c["slug"], n["slug"]),
]
KEY = re.compile(r'(["`])' + re.escape(c["prefix"]) + ":")   # Redis keys like "tw:alerts" or `tw:chat:${c}`
SKIP_DIRS = {".git", "node_modules"}
SKIP = {"rebrand.py", "brandimages.py", "brand.json", ".brand-current.json"}
EXT = (".html", ".js", ".json", ".yml", ".yaml", ".md", ".txt", ".xml", ".css")

changed = 0
for d, dirs, files in os.walk(ROOT):
    dirs[:] = [x for x in dirs if x not in SKIP_DIRS]
    for f in files:
        if f in SKIP or not f.endswith(EXT): continue
        p = os.path.join(d, f); s = open(p, encoding="utf-8").read(); o = s
        for a, b in PAIRS:
            if a != b: s = s.replace(a, b)
        if os.path.relpath(d, ROOT).split(os.sep)[0] in ("api", "lib"):
            s = KEY.sub(lambda m: m.group(1) + n["prefix"] + ":", s)
        if s != o: open(p, "w", encoding="utf-8").write(s); changed += 1
if c["name"] != n["name"]:
    try:
        import brandimages
        brandimages.run(n["name"]); print("wrote the name into assets/brand/hero-logo.webp and pools-table.webp")
    except ImportError:
        print("Pillow is missing (pip install pillow): the two pictures still show the old name")
json.dump({k: n[k] for k in FIELDS}, open(CUR_F, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
print(f"renamed {c['name']} -> {n['name']} in {changed} files")
