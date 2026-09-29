/* Legwork shared code: loads /api/market, resolves basket legs to live tokens, computes levels,
   fills the status strip. Each page adds its own render on top. */
window.Legwork = (function(){
"use strict";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const SEG = ["c1","h1","c2","h2","c3"];

// Curated baskets: [ticker, weight]. Legs whose token isn't live on the chain are left out and the rest re-weighted.
const BASKETS = [
  {id:"mega-cap", name:"Mega Cap Five", sub:"The five largest US companies.", cat:"equity",
   legs:[["AAPL",20],["MSFT",20],["NVDA",20],["GOOGL",20],["AMZN",20]]},
  {id:"retail", name:"Retail Favourites", sub:"The names retail actually trades.", cat:"equity",
   legs:[["TSLA",35],["PLTR",35],["AMD",30]]},
  {id:"ai-buildout", name:"AI Buildout", sub:"Chips, networking and the fabs behind them.", cat:"equity",
   legs:[["NVDA",40],["AVGO",20],["TSM",20],["AMD",20]]},
  {id:"chain-exposure", name:"Chain Exposure", sub:"Listed companies that move with crypto.", cat:"crypto",
   legs:[["COIN",25],["MSTR",25],["HOOD",25],["CRCL",25]]},
  {id:"broad-market", name:"Broad Market", sub:"A slice of the whole index.", cat:"index",
   legs:[["SPY",50],["QQQ",30],["IWM",20]]},
  {id:"platforms", name:"Platforms", sub:"Ads, feeds and app stores.", cat:"equity",
   legs:[["META",30],["GOOGL",30],["NFLX",20],["AAPL",20]]},
  {id:"steady", name:"Steady Cash", sub:"Dividend payers with long records.", cat:"equity",
   legs:[["KO",25],["PG",25],["JNJ",25],["PEP",25]]},
];

const fmtUsd = (v, d) => v == null ? "–" : "$" + (Math.abs(v) >= 1e9 ? (v/1e9).toFixed(2) + "B" : Math.abs(v) >= 1e6 ? (v/1e6).toFixed(2) + "M" :
  Math.abs(v) >= 1e4 ? (v/1e3).toFixed(1) + "K" : v.toFixed(d ?? 2));
const fmtPrice = v => v == null ? "–" : "$" + v.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: v < 1 ? 4 : 2});
const fmtChg = v => v == null || !isFinite(v) ? "–" : (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2) + "%";
const dots = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

let market = null;

function findToken(ticker){
  const T = ticker.toUpperCase();
  return market.tokens.find(t => t.symbol === T) || market.tokens.find(t => t.symbol.toUpperCase() === T) ||
    market.tokens.find(t => t.symbol.startsWith(T) && /^[a-z.]+$/.test(t.symbol.slice(T.length)));
}
const priced = t => t && t.onchain != null && t.change24h != null;

// Level: what 100 put in 24 hours ago at these weights is worth now, from each leg's on-chain 24h change.
function resolve(def){
  const legs = def.legs.map(([t, w]) => ({ticker: t, w, token: findToken(t)}));
  const live = legs.filter(l => priced(l.token));
  const total = live.reduce((s, l) => s + l.w, 0);
  live.forEach(l => { l.wn = l.w / total; l.contrib = l.wn * l.token.change24h; });
  const level = live.length ? 100 * live.reduce((s, l) => s + l.wn * (1 + l.token.change24h / 100), 0) : null;
  return {...def, legs, live, missing: legs.filter(l => !priced(l.token)).map(l => l.ticker),
    level, change: level == null ? null : level - 100,
    liquidity: live.reduce((s, l) => s + (l.token.liquidity || 0), 0),
    volume: live.reduce((s, l) => s + (l.token.volume24h || 0), 0)};
}

// Baskets that build themselves from today's data, equal-weighted.
function autoBaskets(){
  const pool = market.tokens.filter(t => priced(t) && t.liquidity >= 5000);
  const top = (key, n) => [...pool].sort((a, b) => (b[key] || 0) - (a[key] || 0)).slice(0, n);
  const mk = (id, name, sub, list) => list.length >= 3 ? [{id, name, sub, cat:"auto", legs: list.map(t => [t.symbol, Math.round(1000 / list.length) / 10])}] : [];
  return [
    ...mk("most-traded", "Most Traded", "Today's five busiest tokens by 24h volume.", top("volume24h", 5)),
    ...mk("deepest", "Deepest Pools", "The five tokens with the most on-chain liquidity.", top("liquidity", 5)),
  ];
}

// Markets lists baskets with at least three live legs; auto baskets with the same legs as one before them are dropped.
function allBaskets(){
  const seen = new Set();
  return [...BASKETS, ...autoBaskets()].map(resolve).filter(b => {
    const key = b.live.map(l => l.token.symbol).sort().join();
    if (b.live.length < 3 || (b.cat === "auto" && seen.has(key))) return false;
    seen.add(key); return true;
  });
}

function basketFromQuery(q){
  if (q.get("id")) { const d = [...BASKETS, ...autoBaskets()].find(b => b.id === q.get("id")); return d && resolve(d); }
  if (q.get("legs")){
    const legs = q.get("legs").split(",").map(s => s.split(":")).filter(p => p[0] && +p[1] > 0).slice(0, 5).map(([t, w]) => [t.toUpperCase().slice(0, 12), +w]);
    if (legs.length) return resolve({id:"custom", name: (q.get("name") || "Custom basket").slice(0, 40), sub:"Built on Legwork.", cat:"custom", legs});
  }
  return null;
}

function comp(b, big){
  const legs = b.live;
  return `<div class="comp${big ? " big" : ""}" role="img" aria-label="${esc(legs.map(l => l.token.symbol + " " + Math.round(l.wn * 100) + "%").join(", "))}">${
    legs.map((l, i) => `<span class="${SEG[i % SEG.length]}" style="flex:${l.wn}" title="${esc(l.token.symbol)} · ${(l.wn * 100).toFixed(0)}%"></span>`).join("")}</div>`;
}

function strip(){
  const m = market, set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  set("block", m.block ? dots(m.block) : "–");
  set("eth", m.eth ? fmtPrice(m.eth) : "–");
  set("nTokens", m.tokens.length);
  set("vol", fmtUsd(m.tokens.reduce((s, t) => s + (t.volume24h || 0), 0), 0));
  set("mkt", m.marketOpen ? "US session open" : "US session closed");
  set("updated", new Date(m.updatedAt).toLocaleTimeString("en-US", {hour:"2-digit", minute:"2-digit"}));
  document.querySelector(".live")?.classList.add("on");
}

async function load(){
  const r = await fetch("/api/market", {headers: {accept: "application/json"}});
  if (!r.ok) throw new Error("HTTP " + r.status);
  market = await r.json();
  if (!market.tokens || !market.tokens.length) throw new Error("no tokens");
  strip();
  return market;
}

function fail(el, cols){
  const msg = `Live data couldn't be loaded right now. Legwork only shows real prices, so there's nothing to show until the sources answer again. <a href="">Reload</a>`;
  if (el) el.innerHTML = cols ? `<tr><td colspan="${cols}" class="empty">${msg}</td></tr>` : `<p class="empty">${msg}</p>`;
  const s = $("stripState"); if (s) s.textContent = "Data unavailable";
}

// Refresh every minute while the tab is visible (the API is cached for a minute at the edge).
function every(fn){
  setInterval(() => { if (!document.hidden) load().then(fn).catch(() => {}); }, 60000);
}

document.addEventListener("click", e => {
  const b = e.target.closest("[data-wallet]"); if (!b) return;
  b.textContent = "Read-only"; setTimeout(() => b.textContent = "No wallet", 1600);
});

return {$, esc, SEG, BASKETS, fmtUsd, fmtPrice, fmtChg, load, fail, every, allBaskets, resolve, basketFromQuery, findToken, priced, comp,
  get market(){ return market; }};
})();
