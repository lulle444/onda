// /compare/<id8>,<id8>[,<id8>] (rewritten here by vercel.json): compare.html with the chosen pools in the
// title, description and share image, so a shared comparison previews on X. The page renders in the browser.
const {currentPools} = require("../lib/llama");
const A = require("../lib/alerts");
const {template, fill, send} = require("../lib/page");

module.exports = async function handler(req, res){
  let html = template("compare.html");
  const want = String((req.query || {}).ids || "").toLowerCase().split(",").filter(x => /^[0-9a-f]{8}$/.test(x)).slice(0, 3);
  try {
    const {data, protocols} = want.length ? await currentPools(A.SITE) : {data: []};
    const picked = want.map(w => data.find(x => String(x.pool).startsWith(w))).filter(Boolean);
    if (picked.length){
      const ids = picked.map(p => String(p.pool).slice(0, 8)).join(",");
      const dup = new Set(picked.map(p => p.symbol)).size < picked.length;   // "USDC vs USDC" needs the protocol
      html = fill(html, {
        title: `Compare ${picked.map(p => dup ? `${p.symbol} on ${A.nameOf(p, protocols)}` : p.symbol).join(" vs ")} · Basewatch`,
        desc: picked.map(p => `${p.symbol} on ${A.nameOf(p, protocols)}: ${A.pct(A.apyOf(p))} APY, ${A.usd(p.tvlUsd)} TVL`).join(" · ") + ". Side by side on Basewatch, with APY history and risk scores.",
        url: `${A.SITE}/compare/${ids}`, img: `${A.SITE}/api/og?p=compare&ids=${ids}`,
      });
    }
  } catch (e) {
    console.error("compare-page", e);
  }
  send(res, html);
};
