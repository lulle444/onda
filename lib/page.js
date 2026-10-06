// Fills a static page's title, description, canonical and share tags for one URL, so links shared on X
// preview the right thing. Used by the pool and compare pages, which render the rest in the browser.
const fs = require("fs"), path = require("path");

const cache = {};
const template = file => cache[file] || (cache[file] = fs.readFileSync(path.join(__dirname, "..", file), "utf8"));
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
const slugify = t => String(t).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function fill(html, {title, desc, url, img}){
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*/, `$1${esc(desc)}`)
    .replace(/(<meta property="og:description" content=")[^"]*/, `$1${esc(desc)}`)
    .replace(/(<meta property="og:title" content=")[^"]*/, `$1${esc(title)}`)
    .replace(/(<meta property="og:url" content=")[^"]*/, `$1${esc(url)}`)
    .replace(/(<link rel="canonical" href=")[^"]*/, `$1${esc(url)}`)
    .replace(/(<meta property="og:image" content=")[^"]*/, `$1${esc(img)}`)
    .replace(/(<meta name="twitter:image" content=")[^"]*/, `$1${esc(img)}`);
}

function send(res, html){
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=3600");
  res.status(200).send(html);
}

module.exports = {template, fill, send, slugify};
