/* The Basewatch token page. Everything about the token lives in BW_TOKEN below: leave `address` empty until the
   token is live, and the page says it's coming and that only this page carries the address (so look-alikes can't
   borrow the name). At launch, fill in the fields and commit; nothing else needs to change. */
window.BW_TOKEN = {
  address: "",          // contract address on Base, 0x… (42 characters). Empty = not launched yet.
  ticker: "",           // e.g. "WATCH", without $
  name: "",             // e.g. "Basewatch"
  launchpad: "",        // e.g. "Clanker" or "Zora"
  launchpadUrl: "",     // link to the token on the launchpad
  launched: "",         // date, e.g. "2026-11-01"
  team: [               // every wallet the team controls that holds the token, and how much of the supply it holds
    // {label: "Team wallet", address: "0x…", share: "2%"},
  ],
};

(function(){
"use strict";
const T = window.BW_TOKEN, $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const ADDR = /^0x[0-9a-fA-F]{40}$/;
const live = ADDR.test(T.address || "");
const box = $("tokenStatus");
if (!box) return;
if (!live){
  box.className = "tokenstatus glass none";
  box.innerHTML = `<p class="eyebrow">Status</p><h2>Coming soon</h2>
    <p>The Basewatch token hasn't launched yet. Until it does, any token using our name or logo is not ours, whatever it claims.</p>
    <p>At launch, the contract address will be posted on this page and pinned on <a href="https://x.com/usebasewatch" target="_blank" rel="noopener">@usebasewatch</a>, and nowhere else. We will never DM you about the token.</p>`;
  return;
}
const scan = a => `https://basescan.org/token/${a}`;
const tick = T.ticker ? "$" + esc(T.ticker) : "The token";
$("tokenH").textContent = `${T.ticker ? "$" + T.ticker : "The Basewatch token"}`;
$("tokenLede").textContent = `${T.name || "Basewatch"}'s token on Base${T.launched ? ", launched " + new Date(T.launched).toLocaleDateString("en-US", {dateStyle: "long"}) : ""}. Below is the only official contract, and the rules we hold ourselves to.`;
box.className = "tokenstatus glass live";
box.innerHTML = `<p class="eyebrow">Official contract</p><h2>${tick} on Base</h2>
  <div class="dlgcmd tokaddr"><code id="tokAddr">${esc(T.address)}</code><button class="btn ghost small" type="button" id="tokCopy">Copy</button></div>
  <div class="tokbtns"><a class="btn ghost small" href="${scan(T.address)}" target="_blank" rel="noopener">View on Basescan ↗</a>${T.launchpadUrl ? `<a class="btn ghost small" href="${esc(T.launchpadUrl)}" target="_blank" rel="noopener">${esc(T.launchpad || "Launchpad")} ↗</a>` : ""}</div>
  <p class="note">Check that the address matches exactly, character for character. The same address is pinned on <a href="https://x.com/usebasewatch" target="_blank" rel="noopener">@usebasewatch</a>.</p>
  <h3>Team holdings</h3>
  ${(T.team || []).length ? `<ul class="tokteam">${T.team.map(w => `<li><span>${esc(w.label)}</span><a class="num" href="https://basescan.org/address/${esc(w.address)}" target="_blank" rel="noopener">${esc(String(w.address).slice(0, 6))}…${esc(String(w.address).slice(-4))}</a><b class="num">${esc(w.share)}</b></li>`).join("")}</ul>`
    : `<p>The team holds none of the supply.</p>`}`;
$("tokCopy").addEventListener("click", () => navigator.clipboard?.writeText(T.address).then(() => { $("tokCopy").textContent = "Copied"; }, () => {}));
})();
