/* Tripod's token page. Everything about a token lives in TRIPOD_TOKEN below: leave `address` empty until the
   token is live, and the page says it's coming and that only this page carries the address (so look-alikes
   can't borrow the name). At launch, fill
   in the fields and commit; nothing else needs to change. Works for EVM chains (0x… addresses) and Solana. */
window.TRIPOD_TOKEN = {
  address: "",          // contract / mint address. Empty = not launched yet.
  chain: "",            // e.g. "Robinhood Chain", "Base" or "Solana"
  explorer: "",         // explorer link for the token, e.g. "https://solscan.io/token/<address>"
  ticker: "",           // e.g. "TRIPOD", without $
  launchpad: "",        // e.g. "pump.fun", "Clanker"
  launchpadUrl: "",     // link to the token on the launchpad
  launched: "",         // date, e.g. "2026-11-01"
  team: [               // every wallet the team controls that holds the token, and how much of the supply it holds
    // {label: "Team wallet", address: "…", share: "2%"},
  ],
};

(function(){
"use strict";
const T = window.TRIPOD_TOKEN, $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const EVM = /^0x[0-9a-fA-F]{40}$/, SOL = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;   // Solana addresses are base58
const live = EVM.test(T.address || "") || SOL.test(T.address || "");
const box = $("tokenStatus");
if (!box) return;
if (!live){
  box.className = "tokenbox is-none";
  box.innerHTML = `<p class="caps">Status</p><h2>Coming soon</h2>
    <p>The Tripod token hasn't launched yet. Until it does, any token using our name or logo is not ours, whatever it claims.</p>
    <p>At launch, the address will be posted on this page and pinned on <a href="https://x.com/usetripod" target="_blank" rel="noopener">@usetripod</a>, and nowhere else. We will never DM you about the token.</p>`;
  return;
}
const short = a => `${String(a).slice(0, 6)}…${String(a).slice(-4)}`;
const tick = T.ticker ? "$" + esc(T.ticker) : "The token";
$("h1").innerHTML = `${T.ticker ? "$" + esc(T.ticker) : "The Tripod token"}<span>${T.chain ? " on " + esc(T.chain) : ""}</span>`;
$("tokenLede").textContent = `Tripod's token${T.chain ? " on " + T.chain : ""}${T.launched ? ", launched " + new Date(T.launched).toLocaleDateString("en-US", {dateStyle: "long"}) : ""}. Below is the only official address, and the rules we hold ourselves to.`;
box.className = "tokenbox is-live";
box.innerHTML = `<p class="caps">Official address</p><h2>${tick}${T.chain ? " on " + esc(T.chain) : ""}</h2>
  <div class="tokaddr"><code id="tokAddr">${esc(T.address)}</code><button class="pill" type="button" id="tokCopy">Copy</button></div>
  <div class="tokbtns">${T.explorer ? `<a class="pill" href="${esc(T.explorer)}" target="_blank" rel="noopener">Explorer ↗</a>` : ""}${T.launchpadUrl ? `<a class="pill" href="${esc(T.launchpadUrl)}" target="_blank" rel="noopener">${esc(T.launchpad || "Launchpad")} ↗</a>` : ""}</div>
  <p class="small">Check that the address matches exactly, character for character. The same address is pinned on <a href="https://x.com/usetripod" target="_blank" rel="noopener">@usetripod</a>.</p>
  <h3>Team holdings</h3>
  ${(T.team || []).length ? `<ul class="tokteam">${T.team.map(w => `<li><span>${esc(w.label)}</span><code>${esc(short(w.address))}</code><b>${esc(w.share)}</b></li>`).join("")}</ul>`
    : `<p>The team holds none of the supply.</p>`}`;
$("tokCopy").addEventListener("click", () => navigator.clipboard?.writeText(T.address).then(() => { $("tokCopy").textContent = "Copied"; }, () => {}));
})();
