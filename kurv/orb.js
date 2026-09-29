/* Line orb: latitude contours on a slowly turning, rippling sphere.
   Kurv.orb(canvas, {ripple, color}) returns {set(opts)} so a page can change it live. */
window.Kurv = window.Kurv || {};
Kurv.orb = function(c, opts){
  "use strict";
  const ctx = c.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const o = Object.assign({ripple: 1, color: "38,56,28", scale: 1}, opts);
  let W = 0, H = 0, raf = 0;
  function size(){
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = c.clientWidth; H = c.clientHeight;
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function frame(t){
    ctx.clearRect(0, 0, W, H);
    if (o.scale <= 0) return;
    const R = Math.min(W, H) * .46 * o.scale, cx = W / 2, cy = H / 2;
    const rot = t * .00012, tilt = -.35, ct = Math.cos(tilt), st = Math.sin(tilt);
    const LAT = 64, STEP = 90, a = .045 * o.ripple, b = .025 * o.ripple;
    ctx.lineWidth = .8;
    for (let i = 1; i < LAT; i++){
      const lat = -Math.PI / 2 + Math.PI * i / LAT;
      ctx.beginPath();
      let pen = false;
      for (let j = 0; j <= STEP; j++){
        const lon = Math.PI * 2 * j / STEP;
        const r = 1 + a * Math.sin(lon * 4 + lat * 6 + t * .0008) + b * Math.sin(lon * 9 - lat * 3 - t * .0011);
        const x = r * Math.cos(lat) * Math.cos(lon + rot), y = r * Math.sin(lat), z = r * Math.cos(lat) * Math.sin(lon + rot);
        const y2 = y * ct - z * st, z2 = y * st + z * ct;
        if (z2 < -.05){ pen = false; continue; }
        const px = cx + x * R, py = cy + y2 * R;
        pen ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        pen = true;
      }
      ctx.strokeStyle = `rgba(${o.color},${.35 + .45 * Math.abs(Math.sin(lat))})`;
      ctx.stroke();
    }
  }
  function loop(t){ frame(t); raf = requestAnimationFrame(loop); }
  size();
  addEventListener("resize", () => { size(); if (reduce) frame(0); });
  reduce ? frame(0) : (raf = requestAnimationFrame(loop));
  return {set(n){ Object.assign(o, n); if (reduce) frame(0); }};
};
