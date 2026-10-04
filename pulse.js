/* Base pulse: daily DEX volume, fees and TVL, the busiest DEXs this week and today's swap costs. */
(function(){
"use strict";
const API_URL = "/api/pulse";
const DAY = 864e5;

const $ = id => document.getElementById(id);
const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmtUsd = v => {
  if (v == null || !isFinite(v)) return "–";
  const a = Math.abs(v), s = v < 0 ? "−" : "";
  if (a >= 1e9) return s + "$" + (a/1e9).toFixed(2) + "B";
  if (a >= 1e6) return s + "$" + (a/1e6).toFixed(a >= 1e8 ? 0 : 1) + "M";
  if (a >= 1e3) return s + "$" + (a/1e3).toFixed(a >= 1e5 ? 0 : 1) + "k";
  return s + "$" + a.toFixed(0);
};
const fmtCost = v => v == null || !isFinite(v) ? "–" : v < 0.01 ? "$" + v.toFixed(4) : "$" + v.toFixed(2);
const fmtPct = v => v == null || !isFinite(v) ? "–" : Math.round(v * 100) + "%";
const fmtChange = c => c == null || !isFinite(c) ? "–" : (c > 0 ? "+" : c < 0 ? "−" : "") + Math.abs(Math.round(c * 100)) + "%";
const deltaCls = c => c == null || !isFinite(c) || Math.abs(c) < 0.005 ? "" : c > 0 ? "delta up" : "delta down";

const METRICS = {
  volume: {label: "DEX volume per day", fmt: fmtUsd, name: "DEX volume"},
  fees: {label: "Fees paid per day", fmt: fmtUsd, name: "Fees"},
  tvl: {label: "Total value locked", fmt: fmtUsd, name: "TVL"},
};
const state = {d: null, metric: "volume", range: 90};

/* ---------- this week vs last week ---------- */
// Average of the last 7 full days against the 7 before; TVL compares the latest day with 30 days earlier.
function weekly(pts){
  const avg = xs => xs.length ? xs.reduce((s, p) => s + p[1], 0) / xs.length : null;
  const now = avg(pts.slice(-7)), prev = avg(pts.slice(-14, -7));
  return {now, prev, change: now != null && prev ? now / prev - 1 : null};
}
function monthly(pts){
  const last = pts[pts.length - 1];
  if (!last) return {now: null, change: null};
  const ago = pts.filter(p => p[0] <= last[0] - 30 * DAY).pop();
  return {now: last[1], change: ago && ago[1] ? last[1] / ago[1] - 1 : null};
}

/* ---------- data ---------- */
async function load(){
  try {
    const r = await fetch(API_URL, {headers:{accept:"application/json"}});
    if (!r.ok) throw new Error("HTTP " + r.status);
    const j = await r.json();
    if (!j.series || !j.series.volume || !j.series.volume.length) throw new Error("empty");
    state.d = j;
    const at = new Date(j.updatedAt || Date.now());
    $("dot").className = "dot live";
    set("sourceText", "Live · " + at.toLocaleTimeString("en-US", {hour:"2-digit", minute:"2-digit"}));
    set("updated", "Data from DefiLlama and public RPCs, updated " + at.toLocaleString("en-US", {dateStyle:"medium", timeStyle:"short"}));
    render();
  } catch (e) {
    $("dot").className = "dot sample";
    set("sourceText", "Data unavailable");
    set("verdict", "Base data couldn’t be loaded right now. Please try again in a minute.");
    $("gcplot").innerHTML = `<p class="muted">No data to chart right now.</p>`;
    $("mixBars").innerHTML = `<p class="muted">No data right now.</p>`;
    $("gasRows").innerHTML = `<tr><td colspan="3" class="empty">Gas prices are unavailable right now.</td></tr>`;
    $("rows").innerHTML = `<tr><td colspan="6" class="empty">Protocol data couldn’t be loaded right now.</td></tr>`;
  }
}

/* ---------- render ---------- */
function renderGauge(){
  const s = state.d.series, vol = weekly(s.volume), fees = weekly(s.fees), tvl = monthly(s.tvl);
  set("gVol", fmtUsd(vol.now));
  $("gVolSub").innerHTML = `<span class="${deltaCls(vol.change)}">${fmtChange(vol.change)}</span> 7-day avg. vs week before`;
  set("gFees", fmtUsd(fees.now));
  $("gFeesSub").innerHTML = fees.now != null ? `<span class="${deltaCls(fees.change)}">${fmtChange(fees.change)}</span> 7-day avg. vs week before` : "&nbsp;";
  set("gTvl", fmtUsd(tvl.now));
  $("gTvlSub").innerHTML = tvl.change != null ? `<span class="${deltaCls(tvl.change)}">${fmtChange(tvl.change)}</span> over 30 days` : "&nbsp;";
  const base = state.d.gas && state.d.gas.chains.find(c => c.chain === "Base");
  set("gSwap", fmtCost(base && base.swapUsd));
  set("gSwapSub", base && base.gwei != null ? `Typical swap at ${base.gwei.toPrecision(2)} gwei` : "Gas price unavailable");
}

function renderVerdict(){
  const s = state.d.series, vol = weekly(s.volume), tvl = monthly(s.tvl), top = (state.d.protocols || [])[0];
  const total7 = (state.d.protocols || []).reduce((t, p) => t + (p.vol7d || 0), 0);
  const parts = [];
  if (vol.change != null) parts.push(`Trading on Base is ${Math.abs(vol.change) < 0.03 ? "about flat" : (vol.change < 0 ? "down " : "up ") + Math.abs(Math.round(vol.change * 100)) + "%"} on the week before.`);
  if (tvl.change != null) parts.push(`Deposits ${Math.abs(tvl.change) < 0.03 ? "held steady" : tvl.change < 0 ? "fell" : "grew"} over the last 30 days (${fmtChange(tvl.change)}).`);
  if (top && total7) parts.push(`${top.name} handled ${fmtPct(top.vol7d / total7)} of DEX volume this week.`);
  set("verdict", parts.join(" ") || "Waiting for the first week of data.");
}

function renderChart(){
  const m = METRICS[state.metric], all = state.d.series[state.metric] || [], box = $("gcplot");
  document.querySelectorAll("[data-metric]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.metric === state.metric)));
  document.querySelectorAll("[data-range]").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.range === state.range)));
  set("chartTitle", m.label);
  const pts = all.length ? all.filter(p => p[0] >= all[all.length - 1][0] - state.range * DAY) : [];
  if (!pts.length){ box.innerHTML = `<p class="muted">DefiLlama has no ${esc(m.name.toLowerCase())} for Base right now.</p>`; set("gcnote", ""); return; }
  const peak = pts.reduce((a, p) => p[1] > a[1] ? p : a, pts[0]);
  set("gcnote", `Highest day in this range: ${m.fmt(peak[1])} on ${new Date(peak[0]).toLocaleDateString("en-US", {month:"short", day:"numeric", year:"numeric", timeZone:"UTC"})}.`);
  TWChart.draw(box, {series: [{name: m.name, pts}], fmt: m.fmt, daily: true, floor: 0, label: `${m.label} on Base.`});
}

function bar(label, value, share){
  const w = share == null || !isFinite(share) ? 0 : Math.max(0, Math.min(1, share)) * 100;
  return `<div class="bar defi"><span>${esc(label)}</span><span class="track"><span class="fill" style="width:${w.toFixed(1)}%"></span></span><span class="v">${esc(value)}</span></div>`;
}

function renderMix(){
  const rows = state.d.protocols || [], total = rows.reduce((t, p) => t + (p.vol7d || 0), 0);
  if (!rows.length || !total){ $("mixBars").innerHTML = `<p class="muted">No protocol breakdown yet.</p>`; set("mixNote", ""); return; }
  const top = rows.slice(0, 5), rest = total - top.reduce((t, p) => t + (p.vol7d || 0), 0);
  $("mixBars").innerHTML = top.map(p => bar(p.name, fmtPct(p.vol7d / total), p.vol7d / total)).join("") + bar("Everyone else", fmtPct(rest / total), rest / total);
  const lead = top[0].vol7d / total;
  set("mixNote", lead >= 0.5 ? `${top[0].name} alone carries more than half of Base’s trading.` : `The top five DEXs handle ${fmtPct((total - rest) / total)} of the volume.`);
}

function renderGas(){
  const g = state.d.gas;
  if (!g){ $("gasRows").innerHTML = `<tr><td colspan="3" class="empty">Gas prices are unavailable right now.</td></tr>`; return; }
  $("gasRows").innerHTML = g.chains.map(c => `<tr${c.chain === "Base" ? ' class="here"' : ""}>
      <td>${esc(c.chain)}</td><td class="r num">${c.gwei == null ? "–" : esc(c.gwei.toPrecision(2))}</td><td class="r num">${esc(fmtCost(c.swapUsd))}</td></tr>`).join("");
  set("gasNote", `A typical single-pool swap uses about ${state.d.swapGas.toLocaleString("en-US")} gas${g.ethUsd ? `, priced at ETH ${fmtUsd(g.ethUsd)}` : ""}. On the L2s this is execution gas only; each adds a small L1 data fee on top.`);
}

function renderProtocols(){
  const rows = state.d.protocols || [];
  if (!rows.length){ $("rows").innerHTML = `<tr><td colspan="6" class="empty">No protocol breakdown yet.</td></tr>`; return; }
  $("rows").innerHTML = rows.map(p => {
    const url = p.slug ? `https://defillama.com/protocol/${encodeURIComponent(p.slug)}` : null;
    return `<tr>
      <td class="proto">${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(p.name)}</a>` : `<b>${esc(p.name)}</b>`}</td>
      <td><span class="tag">${esc(p.category || "DEX")}</span></td>
      <td class="r num">${fmtUsd(p.vol24h)}</td>
      <td class="r num">${fmtUsd(p.vol7d)}</td>
      <td class="r num"><span class="${deltaCls(p.change7d)}">${fmtChange(p.change7d)}</span></td>
      <td class="r num">${fmtUsd(p.fees24h)}</td></tr>`;
  }).join("");
}

function render(){ renderGauge(); renderVerdict(); renderChart(); renderMix(); renderGas(); renderProtocols(); }

/* ---------- events ---------- */
document.addEventListener("click", e => {
  const m = e.target.closest("[data-metric]"), r = e.target.closest("[data-range]");
  if (m && state.d){ state.metric = m.dataset.metric; renderChart(); }
  if (r && state.d){ state.range = +r.dataset.range; renderChart(); }
});
let rz;
window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => state.d && renderChart(), 150); });

load();
setInterval(load, 10 * 60 * 1000);
})();
