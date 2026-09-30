// Chain pulse for /chain: volume, fees and TVL before and after free gas ended, plus what a swap costs now.
const {pulse} = require("../lib/pulse");
const A = require("../lib/alerts");

module.exports = async function handler(req, res){
  try {
    const data = await pulse(A.SITE);
    res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=3600");
    res.status(200).json({updatedAt: new Date().toISOString(), ...data});
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({error: String(e.message || e)});
  }
};
