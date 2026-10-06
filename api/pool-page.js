// /pool/<slug> (rewritten here by vercel.json): pool.html with this pool's title, description and share image
// filled in, so a link shared on X shows the pool, not a generic card. The page itself renders in the browser.
const fs = require("fs"), path = require("path");
const {currentPools} = require("../lib/llama");
const A = require("../lib/alerts");

let tpl;
const page = () => tpl || (tpl = fs.readFileSync(path.join(__dirname, "..", "pool.html"), "utf8"));
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
const slugify = t => String(t).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const poolPath = p => `/pool/${slugify(p.symbol + "-" + p.project)}-${String(p.pool).slice(0, 8)}`;

module.exports = async function handler(req, res){
  let html = page();
  const tail = (String((req.query || {}).slug || "").match(/-([0-9a-f]{8})$/i) || [])[1];
  try {
    const {data, protocols} = tail ? await currentPools(A.SITE) : {data: []};
    const p = tail && data.find(x => String(x.pool).startsWith(tail.toLowerCase()));
    if (p){
      const name = A.nameOf(p, protocols), apy = A.pct(A.apyOf(p));
      const title = `${p.symbol} on ${name}: ${apy} APY · Basewatch`;
      const desc = `${p.symbol} on ${name} pays ${apy} APY (30-day average ${A.pct(p.apyMean30d)}) with ${A.usd(p.tvlUsd)} TVL on Base. APY history and a transparent risk score.`;
      const url = A.SITE + poolPath(p), img = `${A.SITE}/api/og?p=pool&id=${p.pool}`;
      html = html
        .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
        .replace(/(<meta name="description" content=")[^"]*/, `$1${esc(desc)}`)
        .replace(/(<meta property="og:description" content=")[^"]*/, `$1${esc(desc)}`)
        .replace(/(<meta property="og:title" content=")[^"]*/, `$1${esc(title)}`)
        .replace(/(<meta property="og:url" content=")[^"]*/, `$1${esc(url)}`)
        .replace(/(<link rel="canonical" href=")[^"]*/, `$1${esc(url)}`)
        .replace(/(<meta property="og:image" content=")[^"]*/, `$1${esc(img)}`)
        .replace(/(<meta name="twitter:image" content=")[^"]*/, `$1${esc(img)}`);
    }
  } catch (e) {
    console.error("pool-page", e);   // the page still works; it just keeps the generic share tags
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=3600");
  res.status(200).send(html);
};
