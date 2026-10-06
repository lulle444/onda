// Share-preview images (1200×630 PNG) with today's numbers, one per page: /api/og?p=new.
// Pages point their og:image here; X and others fetch it when a link is shared.
const {redis} = require("../lib/store");
const {currentPools} = require("../lib/llama");
const A = require("../lib/alerts");
const fs = require("fs"), path = require("path");

let logo;
const logoUri = () => logo || (logo = "data:image/png;base64," + fs.readFileSync(path.join(__dirname, "..", "assets", "logo-mark.png")).toString("base64"));

const C = {ink: "#F2F6FF", muted: "#9DAED6", accent: "#3D86FF", up: "#3DDC97", down: "#FF6B5E", card: "rgba(20,50,130,0.45)", edge: "rgba(120,160,255,0.18)"};

const usd = v => {
  const a = Math.abs(v), s = v < 0 ? "−" : "";
  if (a >= 1e9) return s + "$" + (a / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return s + "$" + (a / 1e6).toFixed(1) + "M";
  if (a >= 1e3) return s + "$" + (a / 1e3).toFixed(a >= 1e5 ? 0 : 1) + "k";
  return s + "$" + a.toFixed(0);
};
const fmtN = n => n.toLocaleString("en-US");

// tiny element builder for @vercel/og (it takes React-shaped objects)
const h = (style, ...children) => ({type: "div", props: {style: {display: "flex", ...style}, children: children.flat().filter(c => c != null && c !== false)}});

let fonts;
async function loadFonts(){
  if (fonts) return fonts;
  const want = [["Montserrat", 600], ["Montserrat", 700], ["IBM Plex Sans", 500]];
  const out = [];
  await Promise.all(want.map(async ([name, weight]) => {
    try {
      // without a browser user agent Google Fonts answers with TTF, which the renderer can read
      const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${name.replace(/ /g, "+")}:wght@${weight}`, {signal: AbortSignal.timeout(5000)})).text();
      const url = (css.match(/src: url\((.+?)\) format\('(truetype|opentype)'\)/) || [])[1];
      if (!url) return;
      out.push({name, weight, style: "normal", data: await (await fetch(url, {signal: AbortSignal.timeout(5000)})).arrayBuffer()});
    } catch (e) {}
  }));
  fonts = out;
  return fonts;
}

// What each page's card says. Each returns {eyebrow, big, bigColor, label, stats: [[value, caption] × 3], path}.
const CARDS = {
  async home(){
    const {data, protocols} = await currentPools(A.SITE);
    const pools = data.filter(p => !p.outlier && A.apyOf(p) > 0);
    const best = pools.filter(p => p.stablecoin && p.tvlUsd >= 1e7).sort((a, b) => A.apyOf(b) - A.apyOf(a))[0];
    const tvl = data.reduce((s, p) => s + (p.tvlUsd || 0), 0);
    return {
      eyebrow: "Base yields", big: best ? A.pct(A.apyOf(best)) : "–", bigColor: C.accent,
      label: best ? `Top stablecoin yield today: ${best.symbol} on ${A.nameOf(best, protocols)}` : "Live yields on Base",
      stats: [[fmtN(data.length), "yield pools tracked"], [usd(tvl), "in yield pools"], [fmtN(new Set(data.map(p => p.project)).size), "protocols"]],
      path: "",
    };
  },
  async pool(q){
    const id = String((q || {}).id || "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const {data, protocols} = await currentPools(A.SITE);
    const p = data.find(x => x.pool === id);
    if (!p) return null;
    const total = (p.apyBase || 0) + (p.apyReward || 0), base = total > 0 ? Math.round((p.apyBase || 0) / total * 100) : 100;
    const slug = String(p.symbol + "-" + p.project).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return {
      eyebrow: "Yield pool on Base", big: A.pct(A.apyOf(p)), bigColor: C.accent,
      label: `APY on ${p.symbol} at ${A.nameOf(p, protocols)}`,
      stats: [[A.pct(p.apyMean30d), "30-day average"], [usd(p.tvlUsd), "TVL"], [base + "%", "from fees and interest"]],
      path: `/pool/${slug}-${id.slice(0, 8)}`,
    };
  },
  async compare(q){
    const want = String((q || {}).ids || "").toLowerCase().split(",").filter(x => /^[0-9a-f]{8}$/.test(x)).slice(0, 3);
    if (!want.length) return null;
    const {data, protocols} = await currentPools(A.SITE);
    const picked = want.map(w => data.find(x => String(x.pool).startsWith(w))).filter(Boolean);
    if (!picked.length) return null;
    const best = Math.max(...picked.map(p => p.apyMean30d || 0));
    return {
      eyebrow: "Compare pools", path: "/compare/" + picked.map(p => String(p.pool).slice(0, 8)).join(","),
      cols: picked.map(p => ({sym: p.symbol, name: A.nameOf(p, protocols), apy: A.pct(A.apyOf(p)), avg: A.pct(p.apyMean30d), tvl: usd(p.tvlUsd), top: picked.length > 1 && (p.apyMean30d || 0) === best})),
    };
  },
  async yields(){ return {...await CARDS.home(), eyebrow: "Every yield pool, ranked", path: "/yields"}; },
  async new(){
    const [{data}, seenRaw] = await Promise.all([currentPools(A.SITE), redis("HGETALL", "on:firstseen")]);
    const seen = {};
    for (let i = 0; i < (seenRaw || []).length; i += 2) seen[seenRaw[i]] = +seenRaw[i + 1];
    const since = Date.now() - 30 * 864e5;
    const fresh = data.filter(p => seen[p.pool] >= since);
    return {
      eyebrow: "New on Base", big: fmtN(fresh.length), bigColor: C.accent,
      label: `new yield pool${fresh.length === 1 ? "" : "s"} on Base in the last 30 days`,
      stats: [(n => [fmtN(n), n === 1 ? "protocol behind them" : "protocols behind them"])(new Set(fresh.map(p => p.project)).size), [usd(fresh.reduce((s, p) => s + (p.tvlUsd || 0), 0)), "deposited in them"], [fmtN(data.length), "pools in total"]],
      path: "/new",
    };
  },
};

// Side-by-side card for /compare: one column per pool, the best 30-day average marked.
const SERIES = [C.accent, "#F2A23A", "#3DDC97"];
function compareBody(c){
  const n = c.cols.length, small = n === 3;
  return h({gap: 20, marginTop: 40, flex: 1},
    c.cols.map((x, i) => h({flexDirection: "column", flex: 1, padding: small ? "24px 26px" : "28px 32px", borderRadius: 24, background: C.card, border: `1px solid ${x.top ? "rgba(61,220,151,0.55)" : C.edge}`},
      h({alignItems: "center"},
        h({width: 34, height: 6, borderRadius: 3, background: SERIES[i], marginRight: 14}),
        h({fontFamily: "Montserrat", fontWeight: 700, fontSize: small ? 30 : 36, color: C.ink}, x.sym.length > 16 ? x.sym.slice(0, 15) + "…" : x.sym)),
      h({fontSize: 22, color: C.muted, marginTop: 6}, x.name.length > 26 ? x.name.slice(0, 25) + "…" : x.name),
      h({fontFamily: "Montserrat", fontWeight: 700, fontSize: small ? 64 : 80, color: SERIES[i], marginTop: 26, letterSpacing: -2}, x.apy),
      h({fontSize: 22, color: C.muted, marginTop: 2}, "APY now"),
      h({marginTop: "auto", paddingTop: 22, justifyContent: "space-between", fontSize: 22},
        h({flexDirection: "column"}, h({color: C.ink, fontFamily: "Montserrat", fontWeight: 600, fontSize: 28}, x.avg), h({color: C.muted}, "30-day avg")),
        h({flexDirection: "column", alignItems: "flex-end"}, h({color: C.ink, fontFamily: "Montserrat", fontWeight: 600, fontSize: 28}, x.tvl), h({color: C.muted}, "TVL"))))));
}

function card(c, logo){
  const stat = ([v, cap]) => h({flexDirection: "column", padding: "22px 28px", borderRadius: 22, background: C.card, border: `1px solid ${C.edge}`, flex: 1},
    h({fontFamily: "Montserrat", fontWeight: 700, fontSize: 40, color: C.ink}, v),
    h({fontFamily: "IBM Plex Sans", fontSize: 22, color: C.muted, marginTop: 4}, cap));
  return h({width: 1200, height: 630, flexDirection: "column", padding: "56px 64px", fontFamily: "IBM Plex Sans", color: C.ink,
      backgroundImage: "radial-gradient(900px 500px at 90% -10%, rgba(31,91,255,0.45) 0%, rgba(31,91,255,0) 60%), linear-gradient(180deg, #021033 0%, #020F2E 55%, #03153D 100%)"},
    h({alignItems: "center", justifyContent: "space-between"},
      h({alignItems: "center"},
        {type: "img", props: {src: logo, width: 52, height: 52, style: {marginRight: 16}}},
        h({fontFamily: "Montserrat", fontWeight: 600, fontSize: 28, letterSpacing: 6, color: C.ink}, "BASE", h({color: C.accent}, "WATCH"))),
      h({fontFamily: "Montserrat", fontWeight: 600, fontSize: 20, letterSpacing: 5, color: C.accent, textTransform: "uppercase"}, c.eyebrow)),
    c.cols ? compareBody(c) : h({flexDirection: "column", marginTop: 46, flex: 1},
      h({fontFamily: "Montserrat", fontWeight: 700, fontSize: 132, lineHeight: 1, color: c.bigColor, letterSpacing: -3}, c.big),
      h({fontFamily: "IBM Plex Sans", fontWeight: 500, fontSize: 34, color: C.ink, marginTop: 18, maxWidth: 1000, lineHeight: 1.25}, c.label)),
    c.cols ? null : h({gap: 20}, c.stats.map(stat)),
    h({marginTop: 22, fontSize: 20, color: C.muted, justifyContent: "space-between"},
      h({}, "usebasewatch.vercel.app" + c.path), h({}, "Live on-chain data · Not financial advice")));
}

module.exports = async function handler(req, res){
  const p = String((req.query || {}).p || "home");
  const fallback = () => { res.setHeader("Cache-Control", "public, s-maxage=600"); res.redirect(302, "/assets/og.jpg"); };
  if (!CARDS[p]) return fallback();
  try {
    const [c, f, {ImageResponse}] = await Promise.all([CARDS[p](req.query || {}), loadFonts(), import("@vercel/og")]);
    if (!c) return fallback();
    const img = new ImageResponse(card(c, logoUri()), {width: 1200, height: 630, fonts: f.length ? f : undefined});
    const buf = Buffer.from(await img.arrayBuffer());
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    res.status(200).end(buf);
  } catch (e) {
    console.error("og", p, e);
    fallback();
  }
};
