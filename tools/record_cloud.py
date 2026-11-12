"""The Cloud Has a Footprint hero, take two: the map's hover callouts. A drawn cursor glides onto a pink (coming),
a yellow (running) and a blue (existing) point in turn, resting about two seconds on each so the page's own info
card pops up; the camera drifts very slowly. The real mouse is moved too, so the page's mousemove handler fires.

    python tools/record_cloud.py --out ../_temp_sources/cloud      # hero_master.mp4, hero_sheet.jpg, still_card.png
"""
import argparse
import json
import math
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from record_ski import W, H, FPS, ARGS, smooth, lerp, stitch, contact_sheet  # noqa

URL = "https://gautamik01.github.io/30-day-map-challenge-2026/output/day01_points-ai.html"
HIDE_CSS = ".panel, .mapboxgl-ctrl-group { display: none !important; }"
CURSOR_CSS = """
#rec-cursor { position: fixed; left: 0; top: 0; width: 22px; height: 30px; z-index: 99999; pointer-events: none;
  transform: translate(-3px, -2px); filter: drop-shadow(0 1px 2px rgba(0,0,0,.6)); }
"""
CURSOR_SVG = """<svg id="rec-cursor" viewBox="0 0 22 30" xmlns="http://www.w3.org/2000/svg"><path d="M3 2 L3 24 L8.5 19 L12.5 28 L16 26.5 L12 17.5 L19 17.5 Z" fill="#fff" stroke="#111" stroke-width="1.5" stroke-linejoin="round"/></svg>"""
STEP_JS = """
(cam) => new Promise((res) => {
  if (cam) map.jumpTo(cam);
  const t = setTimeout(res, 2500);
  map.once('idle', () => { clearTimeout(t); res(); });
})
"""
CAM0 = {"center": [-92.5, 37.6], "zoom": 4.35, "pitch": 0, "bearing": 0}
CAM1 = {"center": [-91.0, 37.9], "zoom": 4.55, "pitch": 0, "bearing": 0}
INTRO, HOLD, MOVE, END = 1.6, 2.2, 1.3, 1.2


def targets(page):
    """One feature per layer kind: the largest coming campus, a running campus and an existing data center, picked
    so they sit well apart on screen."""
    return page.evaluate("""() => {
      // D.l0 existing data centers (blue), D.l1 running campuses (yellow), D.l2 coming campuses (pink); _radius is the drawn size
      const layers = C.layers.map(l => ({ l, feats: (D[l.id] || {}).features || [] }));
      const out = {};
      const want = [['coming', /coming/i], ['running', /running/i], ['existing', /existing/i]];
      const inUS = f => { const [x, y] = f.geometry.coordinates; return x > -124 && x < -70 && y > 26 && y < 48; };
      for (const [key, re] of want) {
        const cand = layers.find(x => re.test(x.l.name) && x.feats.length);
        if (!cand) continue;
        const feats = cand.feats.filter(inUS);
        let pick;
        // the campus layers draw above the data centers, so a hovered dot must have no campus within about 40 px
        // (2.5 degrees at this zoom) or the neighbour's card opens instead of its own
        const far = (f, others, deg) => others.every(c => Math.hypot(c.geometry.coordinates[0] - f.geometry.coordinates[0], c.geometry.coordinates[1] - f.geometry.coordinates[1]) > deg);
        const campuses = [...((D.l1 || {}).features || []), ...((D.l2 || {}).features || [])];
        if (key === 'existing') {
          // a lone data center, well away from every campus; nearest to Denver so it sits mid-frame
          const lone = feats.filter(f => far(f, campuses, 2.5));
          const pool = lone.length ? lone : feats;
          const d = f => Math.hypot(f.geometry.coordinates[0] + 104.99, f.geometry.coordinates[1] - 39.74);
          pick = pool.reduce((a, b) => d(b) < d(a) ? b : a, pool[0]);
        } else if (key === 'running') {
          const coming = (D.l2 || {}).features || [];
          const clear = feats.filter(f => far(f, coming, 2.5));
          const pool = clear.length ? clear : feats;
          pick = pool.reduce((a, b) => (b.properties._radius || 0) > (a.properties._radius || 0) ? b : a, pool[0]);
        } else {
          pick = feats.reduce((a, b) => (b.properties._radius || 0) > (a.properties._radius || 0) ? b : a, feats[0]);
        }
        out[key] = { lngLat: pick.geometry.coordinates, name: pick.properties._tip || '', radius: pick.properties._radius };
      }
      return out;
    }""")


def project(page, lnglat):
    return page.evaluate("([x, y]) => { const p = map.project([x, y]); return [p.x, p.y]; }", lnglat)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(args=ARGS)
        ctx = browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=1)
        page = ctx.new_page()
        page.goto(URL, wait_until="networkidle", timeout=120_000)
        page.wait_for_function("typeof map !== 'undefined' && map.loaded()", timeout=120_000)
        page.evaluate(STEP_JS, None)
        page.add_style_tag(content=HIDE_CSS + CURSOR_CSS)
        page.evaluate("(svg) => document.body.insertAdjacentHTML('beforeend', svg)", CURSOR_SVG)
        page.evaluate("() => map.resize()")
        page.evaluate(STEP_JS, CAM0)
        keys = page.evaluate("() => Object.keys(D)")
        print("  D keys:", keys[:12], flush=True)
        tg = targets(page)
        print("  targets:", json.dumps(tg), flush=True)
        order = [k for k in ("coming", "running", "existing") if k in tg]
        # the cursor path: park off the points, then visit each target, resting on it
        plan = [("park", INTRO)]
        for k in order:
            plan += [("to:" + k, MOVE), ("on:" + k, HOLD)]
        plan += [("away", END)]
        total = sum(d for _, d in plan)
        n = int(round(total * FPS))
        frames = out / "frames_cloud2"
        frames.mkdir(exist_ok=True)
        for old in frames.glob("*.jpg"):
            old.unlink()
        cur = [W * 0.62, H * 0.86]
        prev = list(cur)
        t0 = time.time()
        i = 0
        tsum = 0.0
        last_target = None
        for kind, dur in plan:
            start_pos = list(cur)
            for j in range(int(round(dur * FPS))):
                t_in = j / FPS
                tt = tsum + t_in
                cam = {"center": [lerp(CAM0["center"][0], CAM1["center"][0], tt / total), lerp(CAM0["center"][1], CAM1["center"][1], tt / total)],
                       "zoom": lerp(CAM0["zoom"], CAM1["zoom"], tt / total), "pitch": 0, "bearing": 0}
                page.evaluate(STEP_JS, cam)
                if kind.startswith("to:") or kind.startswith("on:"):
                    key = kind[3:]
                    dest = project(page, tg[key]["lngLat"])
                    if kind.startswith("to:"):
                        u = smooth(t_in / dur)
                        cur = [lerp(start_pos[0], dest[0], u), lerp(start_pos[1], dest[1], u)]
                    else:
                        cur = dest
                elif kind == "away":
                    u = smooth(t_in / dur)
                    cur = [lerp(start_pos[0], start_pos[0] + 60, u), lerp(start_pos[1], start_pos[1] + 90, u)]
                page.mouse.move(cur[0], cur[1])
                page.evaluate("([x, y]) => { const c = document.getElementById('rec-cursor'); c.style.left = x + 'px'; c.style.top = y + 'px'; }", cur)
                page.evaluate(STEP_JS, None)
                page.screenshot(path=str(frames / f"frame_{i:05d}.jpg"), type="jpeg", quality=94)
                i += 1
                if i % 90 == 0:
                    print(f"  cloud2: {i}/{n} frames, {time.time() - t0:.0f}s", flush=True)
            tsum += dur
            if kind.startswith("on:"):
                tip = page.evaluate("() => { const t = document.querySelector('.tip'); return t ? { shown: !t.hidden && getComputedStyle(t).display !== 'none', text: (t.innerText || '').slice(0, 80) } : null; }")
                print(f"  after {kind}: tip {tip}", flush=True)
        print(f"  cloud2: {i} frames in {time.time() - t0:.0f}s", flush=True)
        page.close()
        ctx.close()
        stitch(frames, out / "hero_master.mp4")
        contact_sheet(out / "hero_master.mp4", out / "hero_sheet.jpg")

        # the card: the same scene at 2x with the cursor on the pink campus and its card open
        ctx2 = browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=2)
        page = ctx2.new_page()
        page.goto(URL, wait_until="networkidle", timeout=120_000)
        page.wait_for_function("typeof map !== 'undefined' && map.loaded()", timeout=120_000)
        page.evaluate(STEP_JS, None)
        page.add_style_tag(content=HIDE_CSS + CURSOR_CSS)
        page.evaluate("(svg) => document.body.insertAdjacentHTML('beforeend', svg)", CURSOR_SVG)
        page.evaluate("() => map.resize()")
        page.evaluate(STEP_JS, CAM1)
        if "coming" in tg:
            dest = project(page, tg["coming"]["lngLat"])
            page.mouse.move(dest[0], dest[1], steps=10)
            page.evaluate("([x, y]) => { const c = document.getElementById('rec-cursor'); c.style.left = x + 'px'; c.style.top = y + 'px'; }", dest)
            time.sleep(1.0)
        page.evaluate(STEP_JS, None)
        page.screenshot(path=str(out / "still_card.png"))
        print("  still_card.png", flush=True)
        page.close()
        ctx2.close()
        browser.close()
    print("done", flush=True)


if __name__ == "__main__":
    sys.exit(main())
