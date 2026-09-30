// Everything the pages need in one call, cached at the edge for a minute: every Robinhood Chain stock token
// (Robinhood's reference price + the price in its deepest on-chain pool), the latest block and the ETH price.
const {stockBoard, marketOpen, getJson} = require("../lib/stocks");
const RPC = process.env.RPC_URL || "https://rpc.mainnet.chain.robinhood.com";

async function blockNumber(){
  const r = await fetch(RPC, {method: "POST", headers: {"content-type": "application/json"},
    body: JSON.stringify({jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: []}), signal: AbortSignal.timeout(8000)});
  const j = await r.json();
  return parseInt(j.result, 16);
}
const ethPrice = () => getJson("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd").then(j => j.ethereum.usd);

module.exports = async function handler(req, res){
  const [tokens, block, eth] = await Promise.allSettled([stockBoard(), blockNumber(), ethPrice()]);
  if (tokens.status !== "fulfilled"){
    res.setHeader("Cache-Control", "no-store");
    return res.status(502).json({error: String(tokens.reason && tokens.reason.message || tokens.reason)});
  }
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  res.status(200).json({
    updatedAt: new Date().toISOString(),
    marketOpen: marketOpen(),
    block: block.status === "fulfilled" && isFinite(block.value) ? block.value : null,
    eth: eth.status === "fulfilled" ? eth.value : null,
    tokens: tokens.value,
  });
};
