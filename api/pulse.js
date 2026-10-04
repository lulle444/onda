// Base pulse for /pulse: volume, fees, TVL, top DEXs and swap costs, cached at the CDN for 10 minutes.
const {pulse} = require("../lib/pulse");

module.exports = async function handler(req, res){
  try {
    const body = await pulse();
    res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=3600");
    res.status(200).json({updatedAt: new Date().toISOString(), ...body});
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({error: String(e.message || e)});
  }
};
