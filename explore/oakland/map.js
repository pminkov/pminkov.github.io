"use strict";
// The public viewer needs only the city polygons.
const features = window.OAKLAND_DATA.features;
const $ = (id) => document.getElementById(id),
  canvas = $("map"),
  ctx = canvas.getContext("2d");

// Convert longitude/latitude to Web Mercator coordinates in a 0–1 world square,
// matching the projection used by the OpenStreetMap street tiles.
const project = ([lon, lat]) => [
  (lon + 180) / 360,
  (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2,
];
const polygons = features.map((f) =>
  f.geometry.coordinates.map((r) => r.map(project)),
);
// Cache each polygon’s [left, top, right, bottom] bounds for zooming and drawing.
const bounds = polygons.map((rings) => {
  const p = rings.flat();
  return [
    Math.min(...p.map((p) => p[0])),
    Math.min(...p.map((p) => p[1])),
    Math.max(...p.map((p) => p[0])),
    Math.max(...p.map((p) => p[1])),
  ];
});

// Map state: selected feature index, projected center, zoom, and viewport size.
let selected = -1,
  center = [0.16, 0.38],
  zoom = 12,
  width = 1,
  height = 1,
  visible = features.map((_, i) => i),
  tiles = new Map(),
  scheduled = false;
const name = (i) => features[i].properties.NEIGHBHD;
// Show the clicked neighborhood’s name without a sidebar or project metadata.
function select(i, focus) {
  selected = i;
  $("name").textContent = name(i);
  if (focus) fit(bounds[i]);
  draw();
}

// Fit projected bounds into the viewport, leaving room for the map controls.
function fit(b) {
  center = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  zoom = Math.max(
    9,
    Math.min(
      17,
      Math.log2(
        Math.min(
          (width - 100) / (b[2] - b[0]),
          (height - 130) / (b[3] - b[1]),
        ) / 256,
      ),
    ),
  );
  draw();
}
function fitAll() {
  const bs = bounds;
  fit([
    Math.min(...bs.map((b) => b[0])),
    Math.min(...bs.map((b) => b[1])),
    Math.max(...bs.map((b) => b[2])),
    Math.max(...bs.map((b) => b[3])),
  ]);
}

// Translate projected world coordinates into pixels in the current viewport.
function screen(p) {
  const scale = 256 * 2 ** zoom;
  return [
    (p[0] - center[0]) * scale + width / 2,
    (p[1] - center[1]) * scale + height / 2,
  ];
}
function path(i) {
  ctx.beginPath();
  for (const ring of polygons[i]) {
    ring.forEach((p, j) => {
      const [x, y] = screen(p);
      j ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.closePath();
  }
}

// Coalesce rapid input and tile-load events into one render per animation frame.
function draw() {
  if (!scheduled) {
    scheduled = true;
    requestAnimationFrame(render);
  }
}
function render() {
  scheduled = false;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#e9eede";
  ctx.fillRect(0, 0, width, height);
  drawTiles();
  const fill = 0.18;
  // Draw the selected polygon last so its highlighted outline stays visible.
  const order = visible.filter((i) => i !== selected);
  if (visible.includes(selected)) order.push(selected);
  for (const i of order) {
    const b = bounds[i],
      a = screen([b[0], b[1]]),
      c = screen([b[2], b[3]]);
    if (c[0] < 0 || a[0] > width || c[1] < 0 || a[1] > height) continue;
    path(i);
    const active = i === selected;
    ctx.fillStyle = active
      ? `rgba(224,132,54,${Math.min(fill + 0.12, 0.7)})`
      : `hsla(${105 + ((i * 29) % 75)},30%,50%,${fill})`;
    ctx.fill("evenodd");
    ctx.strokeStyle = active ? "#a84916" : "#42634d";
    ctx.lineWidth = active ? 2.8 : 1.1;
    ctx.stroke();
    {
      const xy = screen([(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]);
      if (active || c[0] - a[0] > 72) {
        ctx.font = (active ? "600 " : "") + "11px system-ui";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#ffffffdf";
        ctx.strokeText(name(i), ...xy);
        ctx.fillStyle = active ? "#783508" : "#284835";
        ctx.fillText(name(i), ...xy);
      }
    }
  }
}

// Load only tiles intersecting the viewport. Reuse loaded images while panning.
function drawTiles() {
  const z = Math.max(0, Math.floor(zoom)),
    n = 2 ** z,
    scale = 2 ** (zoom - z),
    tileSize = 256 * scale;
  const left = center[0] * n - width / (2 * tileSize),
    top = center[1] * n - height / (2 * tileSize);
  for (let x = Math.floor(left); x <= Math.floor(left + width / tileSize); x++)
    for (
      let y = Math.floor(top);
      y <= Math.floor(top + height / tileSize);
      y++
    ) {
      if (x < 0 || y < 0 || x >= n || y >= n) continue;
      const key = `${z}/${x}/${y}`;
      let tile = tiles.get(key);
      if (!tile) {
        tile = new Image();
        tile.onload = draw;
        tile.onerror = () => {
          $("tileNotice").hidden = false;
        };
        tile.src = `https://tile.openstreetmap.org/${key}.png`;
        tiles.set(key, tile);
      }
      if (tile.complete && tile.naturalWidth)
        ctx.drawImage(
          tile,
          (x - left) * tileSize,
          (y - top) * tileSize,
          tileSize + 0.3,
          tileSize + 0.3,
        );
    }
  if (tiles.size > 600) {
    for (const key of tiles.keys()) {
      if (!key.startsWith(z + "/")) tiles.delete(key);
      if (tiles.size < 400) break;
    }
  }
}

// Keep the world point beneath the cursor fixed as the zoom changes.
function zoomAt(delta, x = width / 2, y = height / 2) {
  const before = 256 * 2 ** zoom;
  const anchor = [
    center[0] + (x - width / 2) / before,
    center[1] + (y - height / 2) / before,
  ];
  zoom = Math.max(9, Math.min(18, zoom + delta));
  const after = 256 * 2 ** zoom;
  center = [
    anchor[0] - (x - width / 2) / after,
    anchor[1] - (y - height / 2) / after,
  ];
  draw();
}

// Ray casting: an odd number of edge crossings means the point is inside.
// Click selection checks the outer ring and excludes any inner holes.
function inRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}

// Distinguish a click from a drag; pointer capture keeps panning reliable
// when the cursor leaves the canvas during a gesture.
let drag = null;
canvas.addEventListener("pointerdown", (e) => {
  drag = { x: e.clientX, y: e.clientY, center: [...center], moved: false };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x,
    dy = e.clientY - drag.y;
  if (Math.hypot(dx, dy) > 4) drag.moved = true;
  const scale = 256 * 2 ** zoom;
  center = [drag.center[0] - dx / scale, drag.center[1] - dy / scale];
  draw();
});
canvas.addEventListener("pointerup", (e) => {
  if (!drag) return;
  const moved = drag.moved;
  drag = null;
  if (!moved) {
    const r = canvas.getBoundingClientRect(),
      scale = 256 * 2 ** zoom,
      p = [
        center[0] + (e.clientX - r.left - width / 2) / scale,
        center[1] + (e.clientY - r.top - height / 2) / scale,
      ];
    const found = [...visible]
      .reverse()
      .find(
        (i) =>
          inRing(p, polygons[i][0]) &&
          !polygons[i].slice(1).some((r) => inRing(p, r)),
      );
    if (found !== undefined) select(found, false);
  }
});
canvas.addEventListener("pointercancel", () => (drag = null));
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    zoomAt(e.deltaY > 0 ? -0.3 : 0.3, e.clientX - r.left, e.clientY - r.top);
  },
  { passive: false },
);
canvas.addEventListener("keydown", (e) => {
  const step = 70 / (256 * 2 ** zoom);
  if (e.key === "+" || e.key === "=") zoomAt(0.5);
  else if (e.key === "-") zoomAt(-0.5);
  else if (e.key === "ArrowLeft") center[0] -= step;
  else if (e.key === "ArrowRight") center[0] += step;
  else if (e.key === "ArrowUp") center[1] -= step;
  else if (e.key === "ArrowDown") center[1] += step;
  else return;
  e.preventDefault();
  draw();
});

// Keep the public controls limited to zoom and returning to the citywide view.
$("zoomIn").onclick = () => zoomAt(0.5);
$("zoomOut").onclick = () => zoomAt(-0.5);
$("all").onclick = () => {
  selected = -1;
  $("name").textContent = "";
  fitAll();
};

// Size for high-DPI screens and start with the whole city in view.
let first = true;
new ResizeObserver(() => {
  const r = canvas.getBoundingClientRect();
  width = r.width;
  height = r.height;
  const dpr = devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (first) {
    first = false;
    fitAll();
  }
  draw();
}).observe(canvas);
