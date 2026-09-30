/* Chain pulse: Robinhood Chain's volume, fees and TVL before and after the gas subsidy ended. */
(function(){
"use strict";
const API_URL = "/api/chain";
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
const fmtDay = t => new Date(t).toLocaleDateString("en-US", {month:"short", day:"numeric", timeZone:"UTC"});
const deltaCls = c => c == null || !isFinite(c) || Math.abs(c) < 0.005 ? "" : c > 0 ? "delta up" : "delta down";

const METRICS = {
  volume: {label: "DEX volume per day", fmt: fmtUsd, name: "DEX volume"},
  fees: {label: "Fees paid per day", fmt: fmtUsd, name: "Fees"},
  tvl: {label: "Total value locked", fmt: fmtUsd, name: "TVL"},
  launchpadShare: {label: "Share of DEX volume on memecoin launchpads", fmt: fmtPct, name: "On launchpads", floor: 0},
};
const state = {d: null, metric: "volume", range: "all"};

/* ---------- before / after ---------- */
// Averages the week before the subsidy ended and the days since; with no full day since yet, the latest day stands in.
function compare(pts){
  const end = state.d.subsidyEnd, win = state.d.window;
  const pre = pts.filter(p => p[0] < end && p[0] >= end - win * DAY).map(p => p[1]);
  const post = pts.filter(p => p[0] >= end).map(p => p[1]);
  const avg = xs => xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
  const last = pts[pts.length - 1];
  const b = avg(pre), a = post.length ? avg(post) : null;
  const now = a ?? (last ? last[1] : null);
  return {before: b, after: a, days: post.length, last, change: b && now != null ? now / b - 1 : null};
}
const sinceText = c => c.days ? `avg. of ${c.days} day${c.days === 1 ? "" : "s"} since, vs week before` : "latest day vs week before";

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
    set("updated", "Data from DefiLlama, DexScreener and public RPCs, updated " + at.toLocaleString("en-US", {dateStyle:"medium", timeStyle:"short"}));
    render();
  } catch (e) {
    $("dot").className = "dot sample";
    set("sourceText", "Data unavailable");
    set("verdict", "Chain data couldn’t be loaded right now. Please try again in a minute.");
    $("gcplot").innerHTML = `<p class="muted">No data to chart right now.</p>`;
    $("rows").innerHTML = `<tr><td colspan="6" class="empty">Protocol data couldn’t be loaded right now.</td></tr>`;
  }
}

/* ---------- render ---------- */
function renderGauge(){
  const s = state.d.series, vol = compare(s.volume), fees = compare(s.fees), tvl = compare(s.tvl);
  set("gVol", fmtUsd(vol.after ?? vol.last?.[1]));
  $("gVolSub").innerHTML = `<span class="${deltaCls(vol.change)}">${fmtChange(vol.change)}</span> ${esc(sinceText(vol))}`;
  set("gFees", fmtUsd(fees.after ?? fees.last?.[1]));
  $("gFeesSub").innerHTML = fees.last ? `<span class="${deltaCls(fees.change)}">${fmtChange(fees.change)}</span> ${esc(sinceText(fees))}` : "&nbsp;";
  set("gTvl", fmtUsd(tvl.last?.[1]));
  const tvlAtEnd = s.tvl.filter(p => p[0] < state.d.subsidyEnd).pop();
  const tvlCh = tvlAtEnd && tvl.last ? tvl.last[1] / tvlAtEnd[1] - 1 : null;
  $("gTvlSub").innerHTML = tvlAtEnd ? `<span class="${deltaCls(tvlCh)}">${fmtChange(tvlCh)}</span> since free gas ended` : "&nbsp;";
  const rh = state.d.gas && state.d.gas.chains.find(c => c.chain === "Robinhood Chain");
  set("gSwap", fmtCost(rh && rh.swapUsd));
  set("gSwapSub", rh && rh.gwei != null ? `Typical swap at ${rh.gwei.toPrecision(2)} gwei` : "Gas price unavailable");
}

function renderVerdict(){
  const s = state.d.series, vol = compare(s.volume), tvl = compare(s.tvl);
  const peak = s.volume.reduce((m, p) => p[1] > m[1] ? p : m, s.volume[0]);
  const now = vol.after ?? vol.last[1];
  const parts = [];
  if (vol.change != null) parts.push(`Trading is ${vol.change < 0 ? "down" : "up"} ${Math.abs(Math.round(vol.change * 100))}% since free gas ended`);
  if (peak && peak[1] > now * 1.05) parts.push(`${Math.round((1 - now / peak[1]) * 100)}% below the ${fmtDay(peak[0])} peak of ${fmtUsd(peak[1])}`);
  let text = parts.join(", ") + (parts.length ? "." : "");
  if (tvl.change != null) text += Math.abs(tvl.change) < 0.005 ? " Deposits held steady: TVL is flat against the week before."
    : ` Deposits ${Math.abs(tvl.change) < 0.03 ? "held steady" : tvl.change < 0 ? "fell" : "grew"}: TVL is ${fmtChange(tvl.change)} against the week before.`;
  set("verdict", text.trim() || "Waiting for the first full day of data after free gas ended.");
}

function chartPts(){
  const pts = state.d.series[state.metric] || [];
  if (state.range === "all") return pts;
  const from = state.d.subsidyEnd - 30 * DAY;
  return pts.filter(p => p[0] >= from);
}

function renderChart(){
  const m = METRICS[state.metric], pts = chartPts(), box = $("gcplot");
  document.querySelectorAll("[data-metric]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.metric === state.metric)));
  document.querySelectorAll("[data-range]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.range === state.range)));
  set("chartTitle", m.label);
  const c = pts.length ? compare(state.d.series[state.metric]) : null;
  set("gcnote", c && c.before != null ? `Week before: ${m.fmt(c.before)} a day on average. ${c.days ? `Since: ${m.fmt(c.after)}.` : "The first full day since lands after midnight UTC."}` : "");
  if (!pts.length){ box.innerHTML = `<p class="muted">DefiLlama has no ${esc(m.name.toLowerCase())} for the chain yet.</p>`; return; }
  TWChart.draw(box, {
    series: [{name: m.name, pts}], fmt: m.fmt, daily: true, floor: m.floor,
    t1: Math.max(pts[pts.length - 1][0], state.d.subsidyEnd),
    marks: [{t: state.d.subsidyEnd, label: "Free gas ended"}],
    label: `${m.label} on Robinhood Chain.`,
  });
}

function bar(label, value, share, cls){
  const w = share == null || !isFinite(share) ? 0 : Math.max(0, Math.min(1, share)) * 100;
  return `<div class="bar ${cls || ""}"><span>${esc(label)}</span><span class="track"><span class="fill" style="width:${w.toFixed(1)}%"></span></span><span class="v">${esc(value)}</span></div>`;
}

function renderMix(){
  const s = state.d.series, pad = compare(s.launchpadShare), vol = compare(s.volume), st = state.d.stocks;
  const latestVol = vol.last ? vol.last[1] : null;
  const stShare = st && latestVol ? st.volume24h / latestVol : null;
  $("mixBars").innerHTML = s.launchpadShare.length ? [
    bar("Week before", fmtPct(pad.before), pad.before, "defi"),
    bar(pad.days ? "Since" : "Latest day", fmtPct(pad.after ?? pad.last?.[1]), pad.after ?? pad.last?.[1], "defi"),
  ].join("") : `<p class="muted">DefiLlama doesn’t break volume down by protocol yet.</p>`;
  $("stockBars").innerHTML = st ? bar("Last 24h", fmtUsd(st.volume24h), stShare) : `<p class="muted">Stock-token volume is unavailable right now.</p>`;
  set("stockNote", st ? `${st.traded} of ${st.tokens} stock tokens traded on a DEX in the last 24 hours${stShare != null ? `, about ${fmtPct(stShare)} of the chain’s latest daily DEX volume` : ""}.` : "");
  const padNow = pad.after ?? pad.last?.[1];
  set("mixNote", pad.before != null && padNow != null
    ? (padNow < pad.before - 0.02 ? "Memecoin launches cost gas again, and their share of trading is shrinking."
      : padNow > pad.before + 0.02 ? "Memecoins are taking a bigger share of trading, even with gas to pay."
      : "Memecoins’ share of trading has barely moved so far.") : "");
}

function renderGas(){
  const g = state.d.gas;
  if (!g){ $("gasRows").innerHTML = `<tr><td colspan="3" class="empty">Gas prices are unavailable right now.</td></tr>`; return; }
  $("gasRows").innerHTML = g.chains.map(c => `<tr${c.chain === "Robinhood Chain" ? ' class="here"' : ""}>
      <td>${esc(c.chain)}</td><td class="r num">${c.gwei == null ? "–" : esc(c.gwei.toPrecision(2))}</td><td class="r num">${esc(fmtCost(c.swapUsd))}</td></tr>`).join("");
  set("gasNote", `A typical single-pool swap uses about ${state.d.swapGas.toLocaleString("en-US")} gas${g.ethUsd ? `, priced at ETH ${fmtUsd(g.ethUsd)}` : ""}. It counts L2 execution gas only; each chain adds a small L1 data fee on top.`);
}

function renderProtocols(){
  const rows = state.d.protocols || [];
  if (!rows.length){ $("rows").innerHTML = `<tr><td colspan="6" class="empty">No protocol breakdown yet.</td></tr>`; return; }
  $("rows").innerHTML = rows.map(p => {
    const ch = p.before && p.after != null ? p.after / p.before - 1 : null;
    const url = p.slug ? `https://defillama.com/protocol/${encodeURIComponent(p.slug)}` : null;
    return `<tr>
      <td class="proto">${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(p.name)}</a>` : `<b>${esc(p.name)}</b>`}</td>
      <td>${p.launchpad ? `<span class="tag meme">Launchpad</span>` : `<span class="tag">${esc(p.category || "DEX")}</span>`}</td>
      <td class="r num">${fmtUsd(p.before)}</td>
      <td class="r num">${fmtUsd(p.after ?? p.vol24h)}</td>
      <td class="r num"><span class="${deltaCls(ch)}">${fmtChange(ch)}</span></td>
      <td class="r num">${fmtUsd(p.fees24h)}</td></tr>`;
  }).join("");
  const days = compare(state.d.series.volume).days;
  set("afterH", days ? "Avg./day since" : "Last 24h");
}

function render(){ renderGauge(); renderVerdict(); renderChart(); renderMix(); renderGas(); renderProtocols(); }

/* ---------- events ---------- */
document.addEventListener("click", e => {
  const m = e.target.closest("[data-metric]"), r = e.target.closest("[data-range]");
  if (m && state.d){ state.metric = m.dataset.metric; renderChart(); }
  if (r && state.d){ state.range = r.dataset.range; renderChart(); }
});
let rz;
window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => state.d && renderChart(), 150); });

load();
setInterval(load, 10 * 60 * 1000);
})();
