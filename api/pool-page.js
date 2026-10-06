// /pool/<slug> (rewritten here by vercel.json): pool.html with this pool's title, description and share image
// filled in, so a link shared on X shows the pool, not a generic card. The page itself renders in the browser.
const {currentPools} = require("../lib/llama");
const A = require("../lib/alerts");
const {template, fill, send, slugify} = require("../lib/page");

const poolPath = p => `/pool/${slugify(p.symbol + "-" + p.project)}-${String(p.pool).slice(0, 8)}`;

module.exports = async function handler(req, res){
  let html = template("pool.html");
  const tail = (String((req.query || {}).slug || "").match(/-([0-9a-f]{8})$/i) || [])[1];
  try {
    const {data, protocols} = tail ? await currentPools(A.SITE) : {data: []};
    const p = tail && data.find(x => String(x.pool).startsWith(tail.toLowerCase()));
    if (p){
      const name = A.nameOf(p, protocols), apy = A.pct(A.apyOf(p));
      html = fill(html, {
        title: `${p.symbol} on ${name}: ${apy} APY · Basewatch`,
        desc: `${p.symbol} on ${name} pays ${apy} APY (30-day average ${A.pct(p.apyMean30d)}) with ${A.usd(p.tvlUsd)} TVL on Base. APY history and a transparent risk score.`,
        url: A.SITE + poolPath(p), img: `${A.SITE}/api/og?p=pool&id=${p.pool}`,
      });
    }
  } catch (e) {
    console.error("pool-page", e);   // the page still works; it just keeps the generic share tags
  }
  send(res, html);
};
