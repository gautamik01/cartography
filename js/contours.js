/* contours.js : procedural topographic contour lines on a canvas.
 *
 * A height field is built from layered Perlin noise (fractal Brownian motion)
 * whose sample coordinates are themselves warped by a second noise field. The
 * warp is what makes the lines bend and bunch like real relief instead of
 * sitting in concentric blobs. Marching squares then traces iso-lines through
 * the field at evenly spaced levels, every fifth one slightly heavier, like the
 * index contours on a survey sheet.
 *
 * The sheet is rendered once per start() into an offscreen canvas a little
 * larger than the viewport, then drifted across the visible canvas each frame
 * with a single drawImage, so the animation costs almost nothing.
 *
 *   const c = createContours(canvas, { alpha: 0.06 });
 *   c.start();   // renders a fresh sheet and drifts it with requestAnimationFrame
 *   c.stop();
 */

// ---------------------------------------------------------------- Perlin noise (Ken Perlin's improved noise, 2002)
const PERM = new Uint8Array(512);
function seed(s) {
  const p = Array.from({ length: 256 }, (_, i) => i);
  let x = s >>> 0 || 1;
  const rnd = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
}
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + t * (b - a);
function grad(h, x, y, z) {
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
}
function noise3(x, y, z) {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
  x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
  const u = fade(x), v = fade(y), w = fade(z);
  const A = PERM[X] + Y, AA = PERM[A] + Z, AB = PERM[A + 1] + Z;
  const B = PERM[X + 1] + Y, BA = PERM[B] + Z, BB = PERM[B + 1] + Z;
  return lerp(
    lerp(lerp(grad(PERM[AA] & 15, x, y, z), grad(PERM[BA] & 15, x - 1, y, z), u),
         lerp(grad(PERM[AB] & 15, x, y - 1, z), grad(PERM[BB] & 15, x - 1, y - 1, z), u), v),
    lerp(lerp(grad(PERM[AA + 1] & 15, x, y, z - 1), grad(PERM[BA + 1] & 15, x - 1, y, z - 1), u),
         lerp(grad(PERM[AB + 1] & 15, x, y - 1, z - 1), grad(PERM[BB + 1] & 15, x - 1, y - 1, z - 1), u), v),
    w);
}

// octaves, each twice the frequency and half the weight of the last
function fbm(x, y, z, octaves) {
  let sum = 0, amp = 0.5, f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise3(x * f, y * f, z);
    f *= 2.03;
    amp *= 0.5;
  }
  return sum;
}

// domain-warped height: fbm sampled at coordinates pushed around by a coarser fbm
function height(x, y, t) {
  const qx = fbm(x, y, t, 2);
  const qy = fbm(x + 5.2, y + 1.3, t, 2);
  return fbm(x + 0.9 * qx, y + 0.9 * qy, t * 0.7, 4);
}

// ---------------------------------------------------------------- marching squares
// Edge order: 0 top, 1 right, 2 bottom, 3 left. Each case lists the edge pairs to join.
const CASES = [
  [], [[3, 2]], [[2, 1]], [[3, 1]], [[0, 1]], [[3, 0], [2, 1]], [[0, 2]], [[3, 0]],
  [[3, 0]], [[0, 2]], [[3, 2], [0, 1]], [[0, 1]], [[3, 1]], [[2, 1]], [[3, 2]], [],
];

export function createContours(canvas, opts = {}) {
  const alpha = opts.alpha ?? 0.06;
  const levels = opts.levels ?? 16;
  const cell = opts.cell ?? 10;           // CSS px between field samples
  const scale = opts.scale ?? 0.0032;     // noise units per CSS px
  const colour = opts.colour ?? "245, 244, 241";
  const PAD = 260;                        // extra sheet beyond the viewport, room to drift
  const ctx = canvas.getContext("2d");
  const sheet = document.createElement("canvas");
  const sctx = sheet.getContext("2d");
  seed(opts.seed ?? 7);

  let W = 0, H = 0, dpr = 1, raf = 0, running = false, t0 = 0, rendered = false;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    sheet.width = Math.round((W + PAD) * dpr);
    sheet.height = Math.round((H + PAD) * dpr);
    rendered = false;
  }

  // draw one full sheet of contours at time slice z
  function render(z) {
    const sw = W + PAD, sh = H + PAD;
    const gw = Math.ceil(sw / cell) + 1, gh = Math.ceil(sh / cell) + 1;
    const field = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++) {
      const y = j * cell * scale * 1.25;           // stretched so ridges run across the screen
      for (let i = 0; i < gw; i++) field[j * gw + i] = height(i * cell * scale, y, z);
    }
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sctx.clearRect(0, 0, sw, sh);
    sctx.lineCap = "round";
    sctx.lineJoin = "round";
    sctx.strokeStyle = `rgba(${colour}, ${alpha})`;
    // fbm sums to about +-0.9; spread the levels across the middle of that range
    const lo = -0.55, step = 1.1 / levels;
    const paths = Array.from({ length: levels }, () => new Path2D());
    for (let j = 0; j < gh - 1; j++) {
      for (let i = 0; i < gw - 1; i++) {
        const a = field[j * gw + i], b = field[j * gw + i + 1];
        const c = field[(j + 1) * gw + i + 1], d = field[(j + 1) * gw + i];
        const mn = Math.min(a, b, c, d), mx = Math.max(a, b, c, d);
        // only the levels that actually cross this cell
        const l0 = Math.max(0, Math.ceil((mn - lo) / step - 0.5));
        const l1 = Math.min(levels - 1, Math.floor((mx - lo) / step - 0.5));
        if (l1 < l0) continue;
        const x0 = i * cell, y0 = j * cell;
        for (let l = l0; l <= l1; l++) {
          const iso = lo + step * (l + 0.5);
          const code = (a > iso ? 8 : 0) | (b > iso ? 4 : 0) | (c > iso ? 2 : 0) | (d > iso ? 1 : 0);
          if (code === 0 || code === 15) continue;
          const path = paths[l];
          for (const [e1, e2] of CASES[code]) {
            // crossing point on each edge, linearly interpolated
            let px, py, qx, qy;
            switch (e1) {
              case 0: px = x0 + cell * ((iso - a) / (b - a)); py = y0; break;
              case 1: px = x0 + cell; py = y0 + cell * ((iso - b) / (c - b)); break;
              case 2: px = x0 + cell * ((iso - d) / (c - d)); py = y0 + cell; break;
              default: px = x0; py = y0 + cell * ((iso - a) / (d - a));
            }
            switch (e2) {
              case 0: qx = x0 + cell * ((iso - a) / (b - a)); qy = y0; break;
              case 1: qx = x0 + cell; qy = y0 + cell * ((iso - b) / (c - b)); break;
              case 2: qx = x0 + cell * ((iso - d) / (c - d)); qy = y0 + cell; break;
              default: qx = x0; qy = y0 + cell * ((iso - a) / (d - a));
            }
            path.moveTo(px, py);
            path.lineTo(qx, qy);
          }
        }
      }
    }
    paths.forEach((p, l) => {
      sctx.lineWidth = l % 5 === 0 ? 1.5 : 0.9;   // every fifth line is an index contour
      sctx.stroke(p);
    });
    rendered = true;
  }

  function blit(t) {
    // slow diagonal drift; PAD px of slack means no wrap for a long time
    const ox = Math.min(PAD, 20 + t * 12), oy = Math.min(PAD, 20 + t * 7);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(sheet, -ox * dpr, -oy * dpr);
  }

  function frame(now) {
    if (!running) return;
    blit((now - t0) / 1000);
    raf = requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener("resize", () => { resize(); if (running) render(t0 / 1000); }, { passive: true });

  return {
    start() {
      if (running) return;
      running = true;
      t0 = performance.now();
      if (!rendered) render((t0 / 1000) % 97);   // a different sheet each page load
      raf = requestAnimationFrame(frame);
    },
    stop() { running = false; cancelAnimationFrame(raf); rendered = false; },
    still() { if (!rendered) render(0); blit(0); },
    resize,
  };
}
