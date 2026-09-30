// Chain pulse: how Robinhood Chain is doing now that the 90-day gas subsidy has ended. Daily DEX volume, fees
// and TVL from DefiLlama, the launchpad (memecoin) share of volume, stock-token volume, and what a swap costs.
const {currentStocks} = require("./stocks");
const {redis} = require("./store");

const CHAIN = "Robinhood Chain";
const LAUNCH = Date.UTC(2026, 6, 1);          // mainnet launch
const SUBSIDY_END = Date.UTC(2026, 8, 29);    // free gas for Robinhood Wallet ended on this day
const WINDOW = 7;                              // days before the end that count as "before"
const SWAP_GAS = 150000;                       // gas units for a typical single-pool swap
const RPCS = [
  ["Robinhood Chain", process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com"],
  ["Base", "https://mainnet.base.org"],
  ["Arbitrum One", "https://arb1.arbitrum.io/rpc"],
];
const LAUNCHPAD = /launchpad/i;
const LAUNCHPAD_NAMES = /\bpons\b|hood\.fun|pump/i;   // backstop while DefiLlama still files one under another category
const K = {stockVol: "on:pulse:stockvol"};            // hash: UTC date -> stock-token DEX volume that day
const DAY = 864e5;
const hasDb = () => !!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL);

async function getJson(url, init){
  const r = await fetch(url, {headers: {accept: "application/json"}, signal: AbortSignal.timeout(20000), ...init});
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.json();
}

const overview = kind => getJson(`https://api.llama.fi/overview/${kind}/${encodeURIComponent(CHAIN)}?excludeTotalDataChart=false&excludeTotalDataChartBreakdown=false`);

// DefiLlama's charts are [[seconds, value]] or [{date, tvl}], one per UTC day; keep the days since launch.
const daily = rows => (rows || [])
  .map(r => Array.isArray(r) ? [r[0] * 1000, +r[1]] : [(r.date ?? r.timestamp) * 1000, +(r.tvl ?? r.value)])
  .filter(([t, v]) => t >= LAUNCH && isFinite(v))
  .sort((a, b) => a[0] - b[0]);

const sum = xs => xs.reduce((s, x) => s + x, 0);
const before = t => t < SUBSIDY_END && t >= SUBSIDY_END - WINDOW * DAY;
const after = t => t >= SUBSIDY_END;

function isLaunchpad(p){ return LAUNCHPAD.test(p.category || "") || LAUNCHPAD_NAMES.test(p.name || p.displayName || ""); }

// Per-protocol daily volume from the breakdown, averaged over the week before and the days since.
function protocolRows(dex, fees){
  const meta = new Map();
  for (const p of dex.protocols || []) for (const n of [p.name, p.displayName]) if (n) meta.set(n, p);
  const feeBy = new Map();
  for (const p of fees.protocols || []) for (const n of [p.name, p.displayName]) if (n) feeBy.set(n, p.total24h);
  // a protocol missing on a day traded nothing that day, so averages divide by the days in each window
  const sums = new Map(), days = {b: 0, a: 0};
  for (const [sec, by] of dex.totalDataChartBreakdown || []){
    const t = sec * 1000;
    if (!before(t) && !after(t)) continue;
    days[after(t) ? "a" : "b"]++;
    for (const [name, v] of Object.entries(by || {})){
      if (!sums.has(name)) sums.set(name, {b: [], a: []});
      if (isFinite(+v)) sums.get(name)[after(t) ? "a" : "b"].push(+v);
    }
  }
  const names = new Set([...sums.keys(), ...meta.keys()]);
  return [...names].map(name => {
    const p = meta.get(name) || {name}, s = sums.get(name) || {b: [], a: []};
    return {
      name: p.displayName || p.name || name, slug: p.slug || null, category: p.category || null,
      launchpad: isLaunchpad(p), vol24h: p.total24h ?? null, fees24h: feeBy.get(name) ?? null,
      before: days.b ? sum(s.b) / days.b : null, after: days.a ? sum(s.a) / days.a : null,
    };
  }).filter((r, i, all) => (r.vol24h || r.before || r.after) && all.findIndex(o => o.name === r.name) === i)
    .sort((a, b) => (b.vol24h ?? b.after ?? 0) - (a.vol24h ?? a.after ?? 0));
}

// Share of each day's DEX volume that went through launchpads (bonding-curve memecoin trading).
function launchpadShare(dex){
  const pads = new Set();
  for (const p of dex.protocols || []) if (isLaunchpad(p)) for (const n of [p.name, p.displayName]) if (n) pads.add(n);
  return (dex.totalDataChartBreakdown || []).map(([sec, by]) => {
    let all = 0, pad = 0;
    for (const [name, v] of Object.entries(by || {})){ if (!isFinite(+v)) continue; all += +v; if (pads.has(name) || LAUNCHPAD_NAMES.test(name)) pad += +v; }
    return [sec * 1000, all ? pad / all : null];
  }).filter(([t, v]) => t >= LAUNCH && v != null).sort((a, b) => a[0] - b[0]);
}

async function gasPrice(url){
  const j = await getJson(url, {method: "POST", headers: {"content-type": "application/json", accept: "application/json"},
    body: JSON.stringify({jsonrpc: "2.0", id: 1, method: "eth_gasPrice", params: []}), signal: AbortSignal.timeout(8000)});
  const wei = Number(BigInt(j.result));
  if (!isFinite(wei)) throw new Error("bad gas price");
  return wei;
}

async function swapCosts(){
  const [eth, ...prices] = await Promise.all([
    getJson("https://coins.llama.fi/prices/current/coingecko:ethereum").then(j => j.coins["coingecko:ethereum"].price).catch(() => null),
    ...RPCS.map(([, url]) => gasPrice(url).catch(() => null)),
  ]);
  return {ethUsd: eth, chains: RPCS.map(([chain], i) => ({
    chain, gwei: prices[i] == null ? null : prices[i] / 1e9,
    swapUsd: prices[i] == null || eth == null ? null : prices[i] * SWAP_GAS / 1e18 * eth,
  }))};
}

// Stock-token DEX volume today, saved once per UTC day so the page can show how it trends.
async function stockVolume(site){
  const rows = await currentStocks(site);
  const vol = rows.reduce((s, r) => s + (r.volume24h || 0), 0);
  let history = [];
  if (hasDb()){
    const today = new Date().toISOString().slice(0, 10);
    await redis("HSET", K.stockVol, today, String(Math.round(vol))).catch(() => {});
    const raw = await redis("HGETALL", K.stockVol).catch(() => null) || [];
    for (let i = 0; i < raw.length; i += 2) history.push([Date.parse(raw[i]), +raw[i + 1]]);
    history = history.filter(([t, v]) => isFinite(t) && isFinite(v)).sort((a, b) => a[0] - b[0]);
  }
  return {volume24h: vol, tokens: rows.length, traded: rows.filter(r => r.volume24h > 0).length, history};
}

async function pulse(site){
  const [dex, fees, tvl, gas, stocks] = await Promise.all([
    overview("dexs"),
    overview("fees").catch(() => ({})),
    getJson(`https://api.llama.fi/v2/historicalChainTvl/${encodeURIComponent(CHAIN)}`).catch(() => []),
    swapCosts().catch(() => null),
    stockVolume(site).catch(() => null),
  ]);
  const volume = daily(dex.totalDataChart);
  if (!volume.length) throw new Error("no DEX volume for chain");
  return {
    subsidyEnd: SUBSIDY_END, window: WINDOW, swapGas: SWAP_GAS,
    series: {volume, fees: daily(fees.totalDataChart), tvl: daily(tvl), launchpadShare: launchpadShare(dex)},
    protocols: protocolRows(dex, fees).slice(0, 25),
    stocks, gas,
  };
}

// For the share card: our CDN-cached endpoint first, the sources directly as backup.
async function currentPulse(site){
  try {
    const j = await getJson(site.replace(/\/$/, "") + "/api/chain");
    if (j && j.series && j.series.volume && j.series.volume.length) return j;
  } catch (e) {}
  return pulse(site);
}

// Average over the week before the subsidy ended against the days since (or the latest day, before a full one).
function compare(pts){
  const pre = pts.filter(([t]) => before(t)).map(p => p[1]), post = pts.filter(([t]) => after(t)).map(p => p[1]);
  const mean = xs => xs.length ? sum(xs) / xs.length : null;
  const b = mean(pre), now = post.length ? mean(post) : pts.length ? pts[pts.length - 1][1] : null;
  return {before: b, now, days: post.length, change: b && now != null ? now / b - 1 : null};
}

module.exports = {pulse, currentPulse, compare, SUBSIDY_END, WINDOW, K, _test: {daily, protocolRows, launchpadShare}};
