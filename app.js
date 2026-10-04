(function(){
"use strict";
const CHAIN = "Base";
const POOLS_URL = "https://yields.llama.fi/pools";
const PROTOCOLS_URL = "https://api.llama.fi/protocols";
const API_URL = "/api/pools";
const TG_BOT = "ondaalert_bot";   // Telegram alerts bot username, without @. Empty hides the alert buttons.

const STABLES = /^(USD|USDC|USDT|USDG|USDE|SUSDE|DAI|SDAI|USDS|SUSDS|PYUSD|FRAX|GHO|USD0|RLUSD|USDX|EURC|STEAKUSDG|STEAKUSDC)/;
// ETH and its liquid-staking / restaking wrappers (wstETH, cbETH, weETH, superOETHb, ...).
// Bitcoin wrappers on Base (Coinbase cbBTC, tBTC, LBTC, ...).
const BTCS = /^(CB|T|L|W|E|F|SOLV|UNI|U)?BTC(B|\.B)?$|^SOLVBTC/;
const ETHS = /^(W|WST|ST|CB|R|WE|EZ|RS|WRS|SUPERO|O|PUF|M|BSD|YO|S|EETH|AA)?ETH(X|B)?$/;

const PAGE_LIMIT = +document.body.dataset.limit || 25;
const HIST_API = "/api/pool-history?pool=", HIST_LLAMA = "https://yields.llama.fi/chart/";
const RANGES = {"30d": 30 * 864e5, "90d": 90 * 864e5, "All": Infinity};
const poolHistory = new Map();   // pool id -> [[time ms, APY, base APY, reward APY, TVL], ...]
const NEW_PAGE = document.body.dataset.page === "new";   // "New on the chain": only pools first seen recently
const COLS = NEW_PAGE ? 7 : 6;
const state = {open:null, range:"30d", newDays:30, newComplete:true, pools:[], kind:"all", minTvl: +(document.body.dataset.minTvl ?? 100000), maxRisk: document.body.dataset.maxRisk || "high", q:"", hideOdd:true, sort: document.body.dataset.sort || "apy", dir:-1, limit:PAGE_LIMIT, sample:false};

/* ---------- helpers ---------- */
const $ = id => document.getElementById(id);
const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmtUsd = v => {
  if (v == null || !isFinite(v)) return "–";
  const a = Math.abs(v);
  if (a >= 1e9) return "$" + (v/1e9).toFixed(2) + "B";
  if (a >= 1e6) return "$" + (v/1e6).toFixed(a >= 1e8 ? 0 : 1) + "M";
  if (a >= 1e3) return "$" + (v/1e3).toFixed(a >= 1e5 ? 0 : 1) + "k";
  return "$" + v.toFixed(0);
};
const fmtPct = v => (v == null || !isFinite(v)) ? "–" : (v >= 100 ? v.toFixed(0) : v.toFixed(2)) + "%";
const fmtUsdFull = v => "$" + v.toLocaleString("en-US", {maximumFractionDigits:0});
const titleCase = slug => slug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

function classify(sym, stableFlag){
  const parts = String(sym).toUpperCase().split(/[-\/ ]+/).filter(Boolean);
  if (stableFlag || parts.every(p => STABLES.test(p))) return "stable";
  if (parts.length && parts.every(p => ETHS.test(p))) return "eth";
  if (parts.length && parts.every(p => BTCS.test(p))) return "btc";
  return "crypto";
}

function score(p, meta){
  const audited = meta && ((meta.audit_links && meta.audit_links.length) || meta.audits === "2" || meta.audits === "1") ? 1 : 0;
  const tvl = Math.max(0, Math.min(1, (Math.log10(Math.max(p.tvlUsd, 1)) - 5) / 3));        // $100k → 0, $100M → 1
  const ageDays = meta && meta.listedAt ? (Date.now()/1000 - meta.listedAt) / 86400 : 0;
  const age = Math.max(0, Math.min(1, ageDays / 730));
  const liq = p.ilRisk === "yes" ? 0 : (p.exposure === "multi" ? 0.6 : 1);
  const total = (p.apyBase || 0) + (p.apyReward || 0);
  const organic = total > 0 ? Math.max(0, Math.min(1, (p.apyBase || 0) / total)) : 1;
  let s = 25*audited + 25*tvl + 20*age + 15*liq + 15*organic;
  if (p.outlier) s -= 15;
  s = Math.round(Math.max(0, Math.min(100, s)));
  return {s, band: (s >= 75 && audited) ? "low" : s >= 50 ? "mid" : "high", audited, ageDays};
}
const BAND_LABEL = {low:"Low", mid:"Medium", high:"High"};
// Share of the APY paid in reward tokens (e.g. AERO emissions on Aerodrome), which can drop or lose value fast.
const rewardShare = p => { const t = (p.apyBase || 0) + (p.apyReward || 0); return t > 0 ? (p.apyReward || 0) / t : 0; };
const mostlyRewards = p => rewardShare(p) > 0.5 && (p.apy || 0) >= 5;
const BAND_RANK = {low:0, mid:1, high:2};

/* ---------- data ---------- */
async function fetchJson(url){
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 25000);
  try { const r = await fetch(url, {signal: ctl.signal}); if (!r.ok) throw new Error(r.status); return await r.json(); }
  finally { clearTimeout(t); }
}

function build(poolsRaw, protocolsRaw){
  const meta = new Map();
  (protocolsRaw || []).forEach(p => { if (p && p.slug) meta.set(p.slug, p); });
  // Pools that pay nothing now and haven't lately (e.g. collateral-only markets) aren't yield options.
  const earns = p => (p.apy ?? ((p.apyBase || 0) + (p.apyReward || 0))) > 0 || (p.apyMean30d || 0) > 0;
  return poolsRaw.filter(p => p.chain === CHAIN && p.tvlUsd > 0 && earns(p)).map(p => {
    const m = meta.get(p.project);
    const sc = score(p, m);
    const apy = p.apy ?? ((p.apyBase || 0) + (p.apyReward || 0));
    return {
      id: p.pool, project: p.project, name: m ? m.name : titleCase(p.project),
      url: m && m.url ? m.url : "https://defillama.com/yields/pool/" + p.pool,
      category: m ? m.category : "", symbol: p.symbol, meta: p.poolMeta,
      kind: classify(p.symbol, p.stablecoin), tvlUsd: p.tvlUsd, apy,
      apyBase: p.apyBase, apyReward: p.apyReward, apyMean30d: p.apyMean30d ?? apy,
      d7: p.apyPct7D, ilRisk: p.ilRisk, exposure: p.exposure, outlier: !!p.outlier,
      score: sc.s, band: sc.band, audited: sc.audited, ageDays: sc.ageDays
    };
  });
}

/* Clearly-labelled fallback, shown only when live fetch fails. Illustrative values, not current. */
const SAMPLE_PROTOCOLS = [
  {slug:"aave-v3",name:"Aave V3",category:"Lending",url:"https://aave.com",audit_links:["x"],listedAt:1647000000},
  {slug:"morpho-blue",name:"Morpho Blue",category:"Lending",url:"https://morpho.org",audit_links:["x"],listedAt:1704067200},
  {slug:"moonwell-lending",name:"Moonwell",category:"Lending",url:"https://moonwell.fi",audit_links:["x"],listedAt:1655000000},
  {slug:"aerodrome-slipstream",name:"Aerodrome Slipstream",category:"Dexs",url:"https://aerodrome.finance",audit_links:["x"],listedAt:1714000000},
  {slug:"fluid-lending",name:"Fluid Lending",category:"Lending",url:"https://fluid.io",audit_links:["x"],listedAt:1708000000},
  {slug:"compound-v3",name:"Compound V3",category:"Lending",url:"https://compound.finance",audit_links:["x"],listedAt:1661000000},
  {slug:"extra-finance",name:"Extra Finance",category:"Leveraged Farming",url:"https://extrafi.io",audit_links:[],listedAt:1690000000}
];
const SAMPLE_POOLS = [
  ["aave-v3","USDC",410e6,4.6,0,4.8,true,"no","single"],
  ["morpho-blue","STEAKUSDC",380e6,5.1,0.6,5.9,true,"no","single"],
  ["moonwell-lending","USDC",95e6,4.9,1.4,6.2,true,"no","single"],
  ["fluid-lending","USDC",60e6,6.1,0.8,7.0,true,"no","single"],
  ["compound-v3","USDC",48e6,4.4,0.5,4.7,true,"no","single"],
  ["extra-finance","USDC",4.2e6,8.9,2.1,10.4,true,"no","single"],
  ["aave-v3","WETH",520e6,1.9,0,2.0,false,"no","single"],
  ["aave-v3","CBETH",110e6,0.1,0,0.1,false,"no","single"],
  ["morpho-blue","WSTETH",72e6,0.4,0.9,1.2,false,"no","single"],
  ["moonwell-lending","WEETH",31e6,0.3,1.6,1.8,false,"no","single"],
  ["aerodrome-slipstream","WETH-USDC",88e6,22.0,0,24.5,false,"yes","multi","0.05%"],
  ["aerodrome-slipstream","CBBTC-WETH",41e6,14.2,0,15.1,false,"yes","multi","0.05%"],
  ["aerodrome-slipstream","WETH-AERO",12e6,3.0,35.0,41.0,false,"yes","multi","0.3%"],
  ["aave-v3","CBBTC",260e6,0.4,0,0.5,false,"no","single"],
  ["moonwell-lending","CBBTC",44e6,0.2,0.7,0.9,false,"no","single"]
].map((r,i) => ({chain:CHAIN,project:r[0],symbol:r[1],tvlUsd:r[2],apyBase:r[3],apyReward:r[4],apy:r[3]+r[4],apyMean30d:r[5],
  stablecoin:r[6],ilRisk:r[7],exposure:r[8],poolMeta:r[9]||null,pool:"sample-"+i,apyPct7D:null}));

const CACHE_KEY = "on-base-pools-v1", CACHE_MS = 10 * 60 * 1000;
function readCache(){
  try { const c = JSON.parse(sessionStorage.getItem(CACHE_KEY)); if (c && Date.now() - c.t < CACHE_MS && c.pools.length) return c; } catch (e) {}
  return null;
}
function writeCache(pools, at){ try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({t: +at || Date.now(), pools})); } catch (e) {} }

async function load(){
  const cached = readCache();
  try {
    let list, at;
    if (cached) { list = cached.pools; at = new Date(cached.t); }
    else {
      // Our own cached endpoint first (small and fast); DefiLlama directly if it isn't reachable.
      const api = location.protocol.startsWith("http") ? await fetchJson(API_URL).catch(() => null) : null;
      if (api && api.data && api.data.length) {
        list = build(api.data, api.protocols || []);
        at = new Date(api.updatedAt || Date.now());
      } else {
        const [pools, protocols] = await Promise.all([
          fetchJson(POOLS_URL),
          fetchJson(PROTOCOLS_URL).catch(() => [])
        ]);
        list = build(pools.data || [], protocols);
        at = new Date();
      }
      if (!list.length) throw new Error("no pools for chain");
      writeCache(list, at);
    }
    state.pools = list; state.sample = false;
    if (NEW_PAGE){
      const fs = await fetchJson("/api/new").catch(() => null);
      state.newComplete = !!(fs && fs.complete);
      list.forEach(p => { p.firstSeen = fs && fs.firstSeen ? fs.firstSeen[p.id] ?? null : null; });
    }
    $("dot").className = "dot live";
    $("sourceText").textContent = "Live from DefiLlama · " + at.toLocaleTimeString("en-US", {hour:"2-digit", minute:"2-digit"});
    set("updated", "Data from " + at.toLocaleString("en-US", {dateStyle:"medium", timeStyle:"short"}));
  } catch (e) {
    state.pools = build(SAMPLE_POOLS, SAMPLE_PROTOCOLS); state.sample = true;
    $("sampleBanner").hidden = false;
    $("dot").className = "dot sample";
    $("sourceText").textContent = "Sample data";
    set("updated", "Sample data");
  }
  renderAll();
}

/* ---------- render ---------- */
function filtered(){
  const q = state.q.trim().toLowerCase();
  return state.pools.filter(p =>
    (state.kind === "all" || p.kind === state.kind) &&
    (!NEW_PAGE || isNew(p)) &&
    p.tvlUsd >= state.minTvl &&
    !(state.hideOdd && $("hideOdd") && p.outlier) &&
    BAND_RANK[p.band] <= BAND_RANK[state.maxRisk] &&
    (!q || p.symbol.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
  ).sort((a,b) => {
    const k = state.sort, av = a[k], bv = b[k];
    if (typeof av === "string") return state.dir * av.localeCompare(bv);
    return state.dir * ((av ?? -Infinity) - (bv ?? -Infinity));
  });
}

function bell(p){
  if (!TG_BOT || state.sample || !/^[0-9a-f-]{36}$/i.test(p.id || "")) return "";
  return `<a class="bell" href="https://t.me/${TG_BOT}?start=p_${p.id}" target="_blank" rel="noopener" data-pool="${esc(p.id)}" data-label="${esc(p.symbol)} · ${esc(p.name)}" title="Get a Telegram alert for ${esc(p.symbol)}" aria-label="Get a Telegram alert for ${esc(p.symbol)} on ${esc(p.name)}"><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg></a>`;
}

function renderTable(){
  const rows = filtered();
  const shown = rows.slice(0, state.limit);
  $("rows").innerHTML = shown.length ? shown.map(p => {
    const split = (p.apyReward > 0) ? `<span class="apy-split">${fmtPct(p.apyBase || 0)} + ${fmtPct(p.apyReward)} rewards</span>` : "";
    const d = p.d7;
    const delta = (d != null && isFinite(d) && Math.abs(d) >= 0.01) ? `<span class="apy-split delta ${d>0?"up":"down"}">${d>0?"+":""}${d.toFixed(2)} pp 7d</span>` : "";
    const tag = p.kind === "eth" ? '<span class="tag stock">ETH</span>' : p.kind === "btc" ? '<span class="tag stock">BTC</span>' : p.kind === "stable" ? '<span class="tag">Stable</span>' : "";
    const why = `Audit: ${p.audited ? "yes" : "no"} · Age: ${p.ageDays ? Math.round(p.ageDays) + " days" : "unknown"} · IL: ${p.ilRisk === "yes" ? "yes" : "no"}`;
    const canOpen = !state.sample && UUID_RE.test(p.id || ""), open = canOpen && state.open === p.id;
    const rew = mostlyRewards(p) ? ` <span class="tag odd" title="${Math.round(rewardShare(p) * 100)}% of this APY is paid in reward tokens, which can drop quickly or lose value. Fees and interest pay the rest.">Mostly rewards</span>` : "";
    const asset = `<span class="asset">${esc(p.symbol)}</span>${tag}${rew}`;
    return `<tr${canOpen ? ` class="srow${open ? " is-open" : ""}" data-id="${esc(p.id)}"` : ""}>${NEW_PAGE ? `
      <td class="num seen">${p.firstSeen ? `${fmtDay(p.firstSeen)}<small class="sub2">${ago(p.firstSeen)}</small>` : "–"}</td>` : ""}
      <td><div class="proto"><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.name)}</a><span>${esc(p.category || "")}${p.meta ? " · " + esc(p.meta) : ""}</span></div></td>
      <td>${canOpen ? `<button class="ticker assetcell" type="button" aria-expanded="${open}" aria-label="${esc(p.symbol)} on ${esc(p.name)}: show APY history">${asset}<span class="chev" aria-hidden="true">›</span></button>` : `<div class="assetcell">${asset}</div>`}</td>
      <td class="r">${p.outlier ? '<span class="tag odd" title="DefiLlama flags this APY as unusual compared with its own history. Often short-lived reward tokens in a thin pool.">Unusual</span> ' : ""}<span class="apy">${fmtPct(p.apy)}</span>${split}${delta}</td>
      <td class="r num">${fmtPct(p.apyMean30d)}</td>
      <td class="r num">${fmtUsd(p.tvlUsd)}</td>
      <td><div class="riskcell"><span class="risk ${p.band}" title="${esc(why)}">${BAND_LABEL[p.band]} <span class="num">${p.score}</span></span>${bell(p)}</div></td>
    </tr>${open ? detailRow(p) : ""}`;
  }).join("") : `<tr><td colspan="${COLS}" class="empty">${NEW_PAGE && state.sample ? "New pools need live data. Reload the page to try again." : NEW_PAGE ? "No new pools match these filters. Try a longer time window or untick “Hide unusual APYs”." : "No pools match these filters. Try a lower min. TVL or more risk levels."}</td></tr>`;
  set("count", `Showing ${shown.length} of ${rows.length} pools`);
  if (state.open && shown.some(p => p.id === state.open)) drawPoolChart();
  if ($("showMore")) $("showMore").hidden = rows.length <= state.limit;
  document.querySelectorAll("th button").forEach(b => {
    const on = b.dataset.sort === state.sort;
    b.closest("th").setAttribute("aria-sort", on ? (state.dir < 0 ? "descending" : "ascending") : "none");
    b.textContent = b.textContent.replace(/ [↓↑]$/, "") + (on ? (state.dir < 0 ? " ↓" : " ↑") : "");
  });
}

// Best 30-day APY for a kind. Prefer bigger, safer pools; if none qualify
// small, so relax step by step rather than show nothing. DefiLlama's outliers are never picked.
const BEST_STEPS = [{tvl: 1e6, high: false}, {tvl: 1e5, high: false}, {tvl: 1e5, high: true}];
function best(kind){
  for (const st of BEST_STEPS){
    const hit = state.pools.filter(p => p.kind === kind && !p.outlier && p.apyMean30d > 0 && p.tvlUsd >= st.tvl && (st.high || p.band !== "high"))
      .sort((a,b) => b.apyMean30d - a.apyMean30d)[0];
    if (hit) return hit;
  }
}
const bestSub = p => `${p.symbol} on ${p.name}` + (p.tvlUsd < 1e6 || p.band === "high" ? ` · ${BAND_LABEL[p.band]} risk, ${fmtUsd(p.tvlUsd)} TVL` : "");

// Front-page card: the three best 30-day APYs among pools big enough to matter ($5M+ on Base), skipping
// high-risk pools and those paid mostly in reward tokens, so the top isn't all short-lived emissions.
function renderTopNow(){
  const el = $("topNow"); if (!el) return;
  const top = state.pools.filter(p => !p.outlier && p.apyMean30d > 0 && p.tvlUsd >= 5e6 && p.band !== "high" && !mostlyRewards(p))
    .sort((a,b) => b.apyMean30d - a.apyMean30d).slice(0, 3);
  el.innerHTML = top.length ? top.map((p,i) => `<li>
      <span class="tn-n">0${i+1}</span>
      <span class="tn-a"><b>${esc(p.symbol)}</b><small>${esc(p.name)} · ${fmtUsd(p.tvlUsd)} TVL</small></span>
      <span class="tn-y">${fmtPct(p.apyMean30d)}<br><span class="risk ${p.band}">${BAND_LABEL[p.band]} ${p.score}</span></span>
    </li>`).join("") : `<li class="tn-empty">No steady pools above $5M TVL yet.</li>`;
}

function renderGauge(){
  const tvl = state.pools.reduce((s,p) => s + p.tvlUsd, 0);
  const s = best("stable"), k = best("eth"), b = best("btc");
  const sv = s ? fmtPct(s.apyMean30d) : "–", ss = s ? bestSub(s) : "No pools yet";
  set("gBtc", b ? fmtPct(b.apyMean30d) : "–");
  set("gBtcSub", b ? bestSub(b) : "No pools yet");
  set("gTvl", fmtUsd(tvl));
  set("gTvlSub", state.pools.length.toLocaleString("en-US") + " pools · " + new Set(state.pools.map(p => p.project)).size + " protocols");
  set("gStable", sv); set("gStableSub", ss); set("hStable", sv); set("hStableSub", ss);
  set("gStock", k ? fmtPct(k.apyMean30d) : "–");
  set("gStockSub", k ? bestSub(k) : "No pools yet");
}

function renderCalc(){
  const amt = Math.max(0, +$("cAmount").value || 0);
  const months = Math.max(1, Math.min(60, +$("cMonths").value || 1));
  const fee = Math.max(0, +$("cFee").value || 0);
  const kind = $("cKind").value, maxR = $("cRisk").value;
  const opts = state.pools.filter(p => p.kind === kind && p.tvlUsd >= 1e6 && !p.outlier && BAND_RANK[p.band] <= BAND_RANK[maxR])
    .map(p => { const g = amt * (Math.pow(1 + (p.apyMean30d || 0)/100, months/12) - 1) - fee; return {p, g}; })
    .sort((a,b) => b.g - a.g).slice(0, 5);
  $("calcOut").innerHTML = opts.length ? opts.map(({p,g}) => `
    <div class="res">
      <b>${esc(p.symbol)} · ${esc(p.name)}</b><span class="gain">${g >= 0 ? "+" : "−"}${fmtUsdFull(Math.abs(g))}</span>
      <small><span class="risk ${p.band}" style="padding:2px 6px">${BAND_LABEL[p.band]}</span> · ${fmtUsd(p.tvlUsd)} TVL</small><small class="r">${fmtPct(p.apyMean30d)}</small>
    </div>`).join("")
    : `<p class="note">No pools above $1M TVL at that risk level. Choose "All" under max risk.</p>`;
}

function detailRow(p){
  const chips = Object.keys(RANGES).map(k => `<button class="chip" type="button" data-range="${k}" aria-pressed="${k === state.range}">${k}</button>`).join("");
  return `<tr class="detail"><td colspan="${COLS}"><div class="gapchart" id="gapchart">
    <div class="gchead">
      <div><h3>${esc(p.symbol)} on ${esc(p.name)}: APY history</h3><p id="gcstats">Daily readings from DefiLlama.</p></div>
      <div class="gctools"><div class="chips" role="group" aria-label="Time range">${chips}</div>${bell(p).replace('class="bell"', 'class="btn ghost small bellbtn"').replace("</svg></a>", "</svg> Alert me</a>")}</div>
    </div>
    <div class="gclegend" id="gclegend" hidden><span><i class="key"></i>Total APY</span><span><i class="key base"></i>Base APY, without reward tokens</span></div>
    <div class="gcplot" id="gcplot"><p class="muted">Loading history…</p></div>
  </div></td></tr>`;
}

async function loadPoolHistory(id){
  if (poolHistory.has(id)) return poolHistory.get(id);
  let pts = null;
  try { const j = await fetchJson(HIST_API + id); pts = j.points; } catch (e) {}
  if (!pts) try {   // DefiLlama directly if our endpoint isn't reachable
    const j = await fetchJson(HIST_LLAMA + id);
    pts = (j.data || []).map(d => [Date.parse(d.timestamp), d.apy, d.apyBase, d.apyReward, d.tvlUsd]).filter(q => isFinite(q[0]) && q[1] != null);
  } catch (e) {}
  if (pts) poolHistory.set(id, pts);
  return pts || [];
}

async function drawPoolChart(){
  const id = state.open, p = state.pools.find(x => x.id === id), box = $("gcplot");
  if (!p || !box) return;
  const tb = box.closest(".tablebox"); $("gapchart").style.width = Math.max(260, tb.clientWidth - 2) + "px";
  const all = await loadPoolHistory(id);
  if (state.open !== id || !$("gcplot")) return;
  const from = Date.now() - RANGES[state.range], pts = all.filter(q => q[0] >= from);
  const hasRewards = pts.some(q => q[3] > 0);
  $("gclegend").hidden = !hasRewards;
  if (pts.length){
    const apys = pts.map(q => q[1]), avg = apys.reduce((a, b) => a + b, 0) / apys.length;
    const tA = pts[0][4], tB = pts[pts.length - 1][4], since = new Date(pts[0][0]).toLocaleDateString("en-US", {month:"short", day:"numeric", year:"numeric"});
    set("gcstats", `Since ${since}: APY ranged ${fmtPct(Math.min(...apys))} to ${fmtPct(Math.max(...apys))}, averaging ${fmtPct(avg)}. ` +
      (tA > 0 && tB > 0 ? `TVL went from ${fmtUsd(tA)} to ${fmtUsd(tB)}.` : "") + " Daily readings from DefiLlama.");
  } else set("gcstats", "DefiLlama has no history for this pool yet.");
  const series = [{name: "total APY", pts: pts.map(q => [q[0], q[1]])}];
  if (hasRewards) series.push({name: "base APY", cls: "base", pts: pts.map(q => [q[0], q[2] ?? 0])});
  TWChart.draw(box, {
    series, fmt: fmtPct, axisFmt: v => (Math.round(v * 100) / 100) + "%", floor: 0, include: [0], daily: true, breakMs: 3 * 864e5,
    extra: i => pts[i][4] ? `TVL ${fmtUsd(pts[i][4])}` : "",
    label: `${p.symbol} on ${p.name}, APY over ${state.range === "All" ? "all time" : "the last " + state.range}.`,
  });
}

/* ---------- New on the chain ---------- */
const isNew = p => p.firstSeen && p.firstSeen >= Date.now() - state.newDays * 864e5;
const fmtDay = t => new Date(t).toLocaleDateString("en-US", {month:"short", day:"numeric"});
function ago(t){
  const d = Math.floor((Date.now() - t) / 864e5);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : d + " days ago";
}

function renderNew(){
  const fresh = state.pools.filter(isNew);
  // a protocol is new when its first pool on the chain is new
  const byProto = new Map();
  state.pools.forEach(p => { if (!p.firstSeen) return; const g = byProto.get(p.project) || {pools: [], first: Infinity}; g.pools.push(p); g.first = Math.min(g.first, p.firstSeen); byProto.set(p.project, g); });
  const protos = [...byProto.values()].filter(g => g.first >= Date.now() - state.newDays * 864e5).sort((a, b) => b.first - a.first);
  const win = `last ${state.newDays} days`;
  set("nPools", fresh.length); set("nPoolsSub", win);
  set("nProtos", protos.length); set("nProtosSub", win);
  set("nTvl", fmtUsd(fresh.reduce((s, p) => s + p.tvlUsd, 0))); set("nTvlSub", fresh.length ? "across " + fresh.length + " pool" + (fresh.length === 1 ? "" : "s") : "\u00a0");
  const newest = fresh.slice().sort((a, b) => b.firstSeen - a.firstSeen)[0];
  set("nLatest", newest ? ago(newest.firstSeen).replace(/^./, c => c.toUpperCase()) : "–");
  set("nLatestSub", newest ? `${newest.symbol} · ${newest.name}` : "Nothing new in this window");
  set("newNote", state.sample ? "Sample data: new pools need live data." :
    "First seen is the first day DefiLlama tracked the pool." + (state.newComplete ? "" : " Still checking a few pools, so reload in a minute for the full list."));
  const grid = $("protoGrid");
  if (!grid) return;
  grid.innerHTML = protos.length ? protos.map(g => {
    const p = g.pools[0], live = g.pools.filter(x => !x.outlier);
    const tvl = g.pools.reduce((s, x) => s + x.tvlUsd, 0), bestApy = Math.max(...live.map(x => x.apy), -Infinity);
    return `<article class="glass protocard">
      <header><div><h3><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.name)}</a></h3><span>${esc(p.category || "Protocol")}</span></div>
        <span class="tag ${p.audited ? "stock" : "odd"}">${p.audited ? "Audited" : "No audit found"}</span></header>
      <dl>
        <div><dt>Arrived</dt><dd>${fmtDay(g.first)} <small>${ago(g.first)}</small></dd></div>
        <div><dt>Pools</dt><dd class="num">${g.pools.length}</dd></div>
        <div><dt>TVL</dt><dd class="num">${fmtUsd(tvl)}</dd></div>
        <div><dt>Best APY</dt><dd class="num">${isFinite(bestApy) ? fmtPct(bestApy) : `${fmtPct(Math.max(...g.pools.map(x => x.apy)))}<small>unusual</small>`}</dd></div>
      </dl>
      <button class="btn ghost small" type="button" data-proto="${esc(p.name)}">See its pools ↓</button>
    </article>`;
  }).join("") : `<div class="glass note-card empty-card"><p>No new protocols in the ${esc(win)}. ${state.newDays < 90 ? "Try a longer window above." : ""}</p></div>`;
}

function renderAll(){
  if (NEW_PAGE) renderNew();
  renderGauge(); renderTopNow();
  if ($("rows")) renderTable();
  if ($("calcOut")) renderCalc();
}

/* ---------- events ---------- */
document.querySelectorAll(".chip[data-kind]").forEach(b => b.addEventListener("click", () => {
  state.kind = b.dataset.kind; state.limit = PAGE_LIMIT;
  document.querySelectorAll(".chip[data-kind]").forEach(x => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
  renderTable();
}));
document.querySelectorAll(".chip[data-days]").forEach(b => b.addEventListener("click", () => {
  state.newDays = +b.dataset.days; state.limit = PAGE_LIMIT;
  document.querySelectorAll(".chip[data-days]").forEach(x => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
  renderAll();
}));
$("protoGrid")?.addEventListener("click", e => {
  const b = e.target.closest("[data-proto]");
  if (!b || !$("q")) return;
  $("q").value = state.q = b.dataset.proto; state.limit = PAGE_LIMIT; renderTable();
  $("newPoolsH")?.scrollIntoView({behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start"});
});
$("minTvl")?.addEventListener("change", e => { state.minTvl = +e.target.value; state.limit = PAGE_LIMIT; renderTable(); });
$("hideOdd")?.addEventListener("change", e => { state.hideOdd = e.target.checked; state.limit = PAGE_LIMIT; renderTable(); });
$("maxRisk")?.addEventListener("change", e => { state.maxRisk = e.target.value; state.limit = PAGE_LIMIT; renderTable(); });
$("q")?.addEventListener("input", e => { state.q = e.target.value; renderTable(); });
$("showMore")?.addEventListener("click", () => { state.limit += 25; renderTable(); });

/* Alert chooser. On phones the t.me link opens the Telegram app directly; on computers many people
   only use Telegram Web, which t.me can't open, so we offer both plus the command to paste. */
function alertDialog(id, label){
  let d = $("alertDlg");
  if (!d){
    d = document.createElement("dialog"); d.id = "alertDlg"; d.className = "alertdlg glass";
    d.setAttribute("aria-labelledby", "alertDlgH");
    d.innerHTML = `<form method="dialog"><button class="dlgx" aria-label="Close">×</button></form>
      <p class="eyebrow">Telegram alert</p><h3 id="alertDlgH"></h3>
      <p class="dlgsub">Open our bot, tap Start and pick the APY level to watch. We check every 15 minutes.</p>
      <div class="dlgbtns"><a class="btn primary" id="dlgApp" target="_blank" rel="noopener">Open Telegram app</a><a class="btn ghost" id="dlgWeb" target="_blank" rel="noopener">Open Telegram Web</a></div>
      <p class="dlgsub">Bot doesn’t show the pool? Send it this message:</p>
      <div class="dlgcmd"><code id="dlgCmd"></code><button class="btn ghost small" id="dlgCopy" type="button">Copy</button></div>`;
    document.body.appendChild(d);
    d.addEventListener("click", e => { if (e.target === d) d.close(); });
    $("dlgCopy").addEventListener("click", () => {
      navigator.clipboard?.writeText($("dlgCmd").textContent).then(() => { $("dlgCopy").textContent = "Copied"; }, () => {});
    });
  }
  const start = "p_" + id;
  $("alertDlgH").textContent = label;
  $("dlgApp").href = `https://t.me/${TG_BOT}?start=${start}`;
  $("dlgWeb").href = "https://web.telegram.org/k/#?tgaddr=" + encodeURIComponent(`tg://resolve?domain=${TG_BOT}&start=${start}`);
  $("dlgCmd").textContent = "/start " + start;
  $("dlgCopy").textContent = "Copy";
  d.showModal();
}
$("rows")?.addEventListener("click", e => {
  const rg = e.target.closest("[data-range]");
  if (rg){
    state.range = rg.dataset.range;
    document.querySelectorAll("[data-range]").forEach(x => x.setAttribute("aria-pressed", x === rg ? "true" : "false"));
    drawPoolChart(); return;
  }
  const tr = e.target.closest("tr.srow");
  if (tr && !e.target.closest("a")){
    state.open = state.open === tr.dataset.id ? null : tr.dataset.id;
    renderTable();
    if (state.open) $("rows").querySelector(`tr.srow[data-id="${CSS.escape(state.open)}"] .ticker`)?.focus();
    return;
  }
  const a = e.target.closest(".bell, .bellbtn");
  if (!a || matchMedia("(pointer: coarse)").matches || typeof HTMLDialogElement !== "function") return;
  e.preventDefault(); alertDialog(a.dataset.pool, a.dataset.label);
});
let rz; window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { if (state.open && $("gcplot")) drawPoolChart(); }, 150); });
document.querySelectorAll("th button").forEach(b => b.addEventListener("click", () => {
  const k = b.dataset.sort;
  if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = (k === "name" || k === "symbol") ? 1 : -1; }
  renderTable();
}));
$("calc")?.addEventListener("input", renderCalc);
$("calc")?.addEventListener("submit", e => e.preventDefault());

// Deep links into the table, e.g. /yields?kind=eth&tvl=0&odd=1
(function(){
  const q = new URLSearchParams(location.search), chip = document.querySelector(`.chip[data-kind="${q.get("kind")}"]`);
  if (chip){ state.kind = chip.dataset.kind; document.querySelectorAll(".chip[data-kind]").forEach(x => x.setAttribute("aria-pressed", x === chip ? "true" : "false")); }
  if (q.get("odd") === "1" && $("hideOdd")){ $("hideOdd").checked = false; state.hideOdd = false; }
  if ($("minTvl") && [...$("minTvl").options].some(o => +o.value === state.minTvl)) $("minTvl").value = String(state.minTvl);
  if (q.get("q") && $("q")){ $("q").value = state.q = q.get("q"); }
  const tvl = q.get("tvl"), sel = $("minTvl");
  if (sel && tvl !== null && [...sel.options].some(o => o.value === tvl)){ sel.value = tvl; state.minTvl = +tvl; }
})();
load();
})();
