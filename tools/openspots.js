/* where on the world map a 22x14 arena is most open: for placing written fights */
const PM = require("./load.js")(["util.js", "kit.js", "tiles.js", "data.js", "world.js"]);
const W = PM.maps.world, T = PM.T, [x0, y0, x1, y1] = process.argv.slice(2).map(Number);
const res = [];
for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
  let open = 0;
  for (let y = cy - 7; y < cy + 7; y++) for (let x = cx - 11; x < cx + 11; x++) { const t = PM.tileAt(W, x, y); if (t === T.OPEN || t === T.ROUGH || t === T.DIRT || t === T.FIELD) open++; }
  res.push([open, cx, cy]);
}
res.sort((a, b) => b[0] - a[0]);
console.log(res.slice(0, 6).map(r => r.join(":")).join("  "));
