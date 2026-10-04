// Base pulse: daily DEX volume, fees and TVL from DefiLlama, the busiest DEXs this week, and what a swap
// costs on Base next to Ethereum and other L2s.
const CHAIN = "Base";
const KEEP_DAYS = 365;                         // the page charts up to a year
const SWAP_GAS = 150000;                       // gas units for a typical single-pool swap
const RPCS = [
  ["Base", "https://mainnet.base.org"],
  ["Ethereum", "https://ethereum-rpc.publicnode.com"],
  ["Arbitrum One", "https://arb1.arbitrum.io/rpc"],
  ["OP Mainnet", "https://mainnet.optimism.io"],
];
const DAY = 864e5;

async function getJson(url, init){
  const r = await fetch(url, {headers: {accept: "application/json"}, signal: AbortSignal.timeout(20000), ...init});
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.json();
}

// The per-protocol breakdown since 2023 is huge, so only the daily totals and the protocol list are fetched.
const overview = kind => getJson(`https://api.llama.fi/overview/${kind}/${encodeURIComponent(CHAIN)}?excludeTotalDataChart=false&excludeTotalDataChartBreakdown=true`);

// DefiLlama's charts are [[seconds, value]] or [{date, tvl}], one per UTC day; keep the last year.
// Volume and fees for today are still filling up, so those charts stop at the last full day.
const daily = (rows, fullDaysOnly) => {
  const from = Date.now() - KEEP_DAYS * DAY, today = Math.floor(Date.now() / DAY) * DAY;
  return (rows || [])
    .map(r => Array.isArray(r) ? [r[0] * 1000, +r[1]] : [(r.date ?? r.timestamp) * 1000, +(r.tvl ?? r.value)])
    .filter(([t, v]) => t >= from && isFinite(v) && !(fullDaysOnly && t >= today))
    .sort((a, b) => a[0] - b[0]);
};

function protocolRows(dex, fees){
  const feeBy = new Map();
  for (const p of fees.protocols || []) for (const n of [p.name, p.displayName]) if (n) feeBy.set(n, p.total24h);
  return (dex.protocols || []).map(p => ({
    name: p.displayName || p.name, slug: p.slug || null, category: p.category || null,
    vol24h: p.total24h ?? null, vol7d: p.total7d ?? null,
    change7d: isFinite(p.change_7dover7d) ? p.change_7dover7d / 100 : null,
    fees24h: feeBy.get(p.name) ?? feeBy.get(p.displayName) ?? null,
  })).filter(r => r.name && (r.vol24h || r.vol7d))
    .sort((a, b) => (b.vol7d ?? 0) - (a.vol7d ?? 0));
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

async function pulse(){
  const [dex, fees, tvl, gas] = await Promise.all([
    overview("dexs"),
    overview("fees").catch(() => ({})),
    getJson(`https://api.llama.fi/v2/historicalChainTvl/${encodeURIComponent(CHAIN)}`).catch(() => []),
    swapCosts().catch(() => null),
  ]);
  const volume = daily(dex.totalDataChart, true);
  if (!volume.length) throw new Error("no DEX volume for chain");
  return {
    chain: CHAIN, swapGas: SWAP_GAS,
    series: {volume, fees: daily(fees.totalDataChart, true), tvl: daily(tvl)},
    protocols: protocolRows(dex, fees).slice(0, 25),
    gas,
  };
}

module.exports = {pulse, _test: {daily, protocolRows}};
