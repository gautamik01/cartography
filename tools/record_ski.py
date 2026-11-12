"""Records the ski map (MapLibre, live on GitHub Pages) frame by frame at 1920x1080 and 30 fps, then stitches the
frames into master clips. Every frame is rendered with the camera placed by map.jumpTo and the map waited to idle,
so the motion is smooth however slow the software renderer is.

    python tools/record_ski.py --out ../_temp_sources/ski [--only hero hover zoom stills]

Outputs in <dir>: hero_master.mp4, hover_master.mp4, zoom_master.mp4 (libx264 crf 14), one contact sheet per
clip (<name>_sheet.jpg), stills/*.png at 2x, and log lines on stdout.
"""
import argparse
import io
import json
import math
import subprocess
import sys
import time
from pathlib import Path

import imageio_ffmpeg
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

URL = "https://gautamik01.github.io/30-day-map-challenge-2026/output/day21_openstreetmap-ski.html"
W, H, FPS = 1920, 1080, 30
ARGS = ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"]   # the machine's GPU through ANGLE
FF = imageio_ffmpeg.get_ffmpeg_exe()

# the hero clip hides the page's panels and controls so the terrain fills the frame; the other clips keep the real UI
FULL_BLEED_CSS = """
.app{grid-template-columns:1fr !important}
.left,.right,#hint,#back,#notice,#sec,.maplibregl-ctrl-top-right{display:none !important}
"""
CALM_CSS = "#notice{display:none !important}"

# With terrain on this page never reports idle, so a frame is "settled" once every tile the new camera asked for has
# arrived (two renders after the jump, so the requests exist) and one more render has drawn them.
STEP_JS = """
(cam) => new Promise((res) => {
  if (cam) map.jumpTo(cam);
  const t0 = performance.now(), MAX = 6000;
  const finish = () => requestAnimationFrame(() => requestAnimationFrame(res));
  const check = () => {
    const ok = map.areTilesLoaded() && !map.isMoving();
    if ((ok && performance.now() - t0 > 80) || performance.now() - t0 > MAX) { finish(); return; }
    requestAnimationFrame(check);
  };
  requestAnimationFrame(() => requestAnimationFrame(check));
})
"""
# an idle wait that never hangs: idle may already have fired before the listener exists
IDLE_JS = "(ms) => new Promise((res) => { const t = setTimeout(res, ms); map.once('idle', () => { clearTimeout(t); res(); }); requestAnimationFrame(() => requestAnimationFrame(() => { if (map.loaded() && !map.isMoving() && map.areTilesLoaded()) { clearTimeout(t); res(); } })); })"


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def ease_in_out(t):
    t = max(0.0, min(1.0, t))
    return 4 * t * t * t if t < 0.5 else 1 - math.pow(-2 * t + 2, 3) / 2


def lerp(a, b, t):
    return a + (b - a) * t


def lerp_bearing(a, b, t):
    d = ((b - a + 540) % 360) - 180
    return (a + d * t + 360) % 360


def cam_lerp(c0, c1, t, pitch_t=None, bearing_t=None):
    return {
        "center": [lerp(c0["center"][0], c1["center"][0], t), lerp(c0["center"][1], c1["center"][1], t)],
        "zoom": lerp(c0["zoom"], c1["zoom"], t),
        "pitch": lerp(c0["pitch"], c1["pitch"], t if pitch_t is None else pitch_t),
        "bearing": lerp_bearing(c0["bearing"], c1["bearing"], t if bearing_t is None else bearing_t),
    }


def wait_ready(page):
    page.wait_for_function("window.__ready === true", timeout=120_000)
    page.evaluate(IDLE_JS, 15000)
    time.sleep(1.0)


def rows(page):
    return page.evaluate("D.rows")


def overview_cam(page, padding):
    page.evaluate(f"() => map.fitBounds(home, {{padding: {padding}, duration: 0}})")
    page.evaluate(IDLE_JS, 8000)
    c = page.evaluate("() => ({center: map.getCenter().toArray(), zoom: map.getZoom(), pitch: 0, bearing: 0})")
    return c


def mountain_cam(page, r, padding, zoom_off=-0.2):
    w, s, e, n = r["bounds"]
    cam = page.evaluate(f"() => {{ const c = map.cameraForBounds([[{w},{s}],[{e},{n}]], {{padding: {json.dumps(padding)}, bearing: {r['bearing']}}}); return {{center: c.center.toArray ? c.center.toArray() : [c.center.lng, c.center.lat], zoom: c.zoom}}; }}")
    return {"center": cam["center"], "zoom": min(cam["zoom"] + zoom_off, 15), "pitch": 64, "bearing": r["bearing"]}


def select_mountain(page, r):
    """The page's own click handler: loads the mountain's ArcGIS terrain, turns 3D on, hides the overview marks.
    Its real-time flyTo is stopped straight away because the camera is placed frame by frame."""
    page.evaluate(f"() => select({json.dumps(r['id'])})")
    page.evaluate("() => map.stop()")
    page.evaluate(IDLE_JS, 10000)


def show_overview_marks(page, show):
    page.evaluate(f"""() => {{
      for (const k in markers) markers[k].getElement().classList.toggle('gone', !{str(show).lower()});
      for (const c of cityMarks) c.getElement().classList.toggle('gone', !{str(show).lower()});
      map.setPaintProperty('bg', 'background-color', {'"#ececec"' if show else '"#fff"'});
    }}""")


def record(page, frames_dir, plan, label):
    """plan: list of (seconds, fn(t_seconds) -> camera dict or None). Writes frame_%05d.jpg."""
    frames_dir.mkdir(parents=True, exist_ok=True)
    for old in frames_dir.glob("*.jpg"):
        old.unlink()
    total = sum(d for d, _ in plan)
    n = int(round(total * FPS))
    t0 = time.time()
    i = 0
    for seg_len, fn in plan:
        k = int(round(seg_len * FPS))
        for j in range(k):
            t = j / FPS
            cam = fn(t)
            page.evaluate(STEP_JS, cam)          # a hold (cam None) still waits for its tiles
            page.screenshot(path=str(frames_dir / f"frame_{i:05d}.jpg"), type="jpeg", quality=94)
            i += 1
            if i % 60 == 0:
                print(f"  {label}: {i}/{n} frames, {time.time() - t0:.0f}s", flush=True)
    print(f"  {label}: {i} frames in {time.time() - t0:.0f}s", flush=True)
    return i


def stitch(frames_dir, out):
    cmd = [FF, "-hide_banner", "-loglevel", "error", "-y", "-framerate", str(FPS), "-i", str(frames_dir / "frame_%05d.jpg"),
           "-c:v", "libx264", "-preset", "slow", "-crf", "14", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out)]
    subprocess.run(cmd, check=True)
    print("  master", out, f"{out.stat().st_size // 1024} KB", flush=True)


def contact_sheet(video, out, n=6, cell_w=640):
    probe = subprocess.run([FF, "-hide_banner", "-i", str(video)], capture_output=True, text=True).stderr
    dur = 0.0
    for line in probe.splitlines():
        if "Duration:" in line:
            h, m, s = line.split("Duration:")[1].split(",")[0].strip().split(":")
            dur = int(h) * 3600 + int(m) * 60 + float(s)
    times = [dur * (i + 0.5) / n for i in range(n)]
    frames = []
    for t in times:
        data = subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-ss", f"{t:.3f}", "-i", str(video), "-frames:v", "1",
                               "-f", "image2pipe", "-vcodec", "png", "-"], check=True, capture_output=True).stdout
        frames.append(Image.open(io.BytesIO(data)).convert("RGB"))
    cw, ch = cell_w, round(cell_w * 9 / 16)
    sheet = Image.new("RGB", (3 * (cw + 8) + 8, 2 * (ch + 28) + 8), (40, 40, 40))
    dr = ImageDraw.Draw(sheet)
    for i, (f, t) in enumerate(zip(frames, times)):
        x, y = 8 + (i % 3) * (cw + 8), 8 + (i // 3) * (ch + 28)
        sheet.paste(f.resize((cw, ch), Image.LANCZOS), (x, y))
        dr.text((x, y + ch + 6), f"{Path(video).name}  t={t:.1f}s of {dur:.1f}s", fill=(230, 230, 230))
    sheet.save(out, quality=86)
    print("  sheet", out, flush=True)


# ---------------------------------------------------------------- the clips
def hero(ctx, out):
    """16 s: a second on the overview, a seven second top-down dive onto the top-ranked mountain (the regional relief
    gives way to its own hillshade and contours), then the view tilts into 3D and orbits onto the beginner slopes,
    ending looking uphill."""
    page = ctx.new_page()
    page.goto(URL, wait_until="networkidle", timeout=120_000)
    wait_ready(page)
    R = rows(page)
    r = R[0]
    print(f"  hero mountain: #{r['rank']} {r['name']} ({r['beg']:.1f} beginner km, bearing {r['bearing']}, {r['lon']}, {r['lat']})", flush=True)
    page.add_style_tag(content=FULL_BLEED_CSS)
    page.evaluate("() => map.resize()")
    time.sleep(0.5)
    c_over = overview_cam(page, 70)
    select_mountain(page, r)                       # terrain in, 3D on
    show_overview_marks(page, True)                # but start on the overview look
    page.evaluate(STEP_JS, c_over)
    c_mtn = mountain_cam(page, r, {"top": 120, "bottom": 90, "left": 140, "right": 140}, zoom_off=0.0)
    c_fly_end = dict(c_mtn, bearing=lerp_bearing(r["bearing"], r["bearing"] - 40, 1.0), pitch=0)
    c_orbit_end = dict(c_mtn, zoom=c_mtn["zoom"] + 0.3, bearing=r["bearing"], pitch=60)
    HOLD, FLY, ORBIT, END = 1.0, 6.5, 7.7, 0.8
    hid = {"done": False}

    def seg_hold(t):
        return None

    def seg_fly(t):
        u = t / FLY
        if u > 0.2 and not hid["done"]:
            show_overview_marks(page, False)
            hid["done"] = True
        return cam_lerp(c_over, c_fly_end, ease_in_out(u), pitch_t=0, bearing_t=smooth((u - 0.45) / 0.55))

    def seg_orbit(t):
        u = t / ORBIT
        return cam_lerp(c_fly_end, c_orbit_end, smooth(u), pitch_t=smooth(u / 0.55), bearing_t=smooth((u - 0.1) / 0.9))

    record(page, out / "frames_hero", [(HOLD, seg_hold), (FLY, seg_fly), (ORBIT, seg_orbit), (END, lambda t: None)], "hero")
    page.close()
    stitch(out / "frames_hero", out / "hero_master.mp4")
    contact_sheet(out / "hero_master.mp4", out / "hero_sheet.jpg")
    (out / "hero_meta.json").write_text(json.dumps({"mountain": r, "overview": c_over, "end": c_orbit_end, "rows": [dict(rank=x["rank"], name=x["name"], beg=x["beg"], nyc=x["nyc"], phl=x["phl"]) for x in R]}, indent=1))


def hover(ctx, out):
    """9.6 s, the real page: hovering four ski areas in the ranked list, each one lighting up on the map with its
    lead line while the right panel draws its trails; the camera creeps in very slightly for life."""
    page = ctx.new_page()
    page.goto(URL, wait_until="networkidle", timeout=120_000)
    wait_ready(page)
    page.add_style_tag(content=CALM_CSS)
    R = rows(page)
    c0 = page.evaluate("() => ({center: map.getCenter().toArray(), zoom: map.getZoom(), pitch: 0, bearing: 0})")
    c1 = dict(c0, zoom=c0["zoom"] + 0.14)
    picks = [R[0], R[2], R[4], R[1]]
    times = [0.8, 3.0, 5.2, 7.2]
    state = {"i": -1}
    TOTAL = 9.6

    def seg(t):
        want = -1
        for k, at in enumerate(times):
            if t >= at:
                want = k
        if t >= 9.1:
            want = -2
        if want != state["i"]:
            state["i"] = want
            if want >= 0:
                rid = picks[want]["id"]
                page.evaluate(f"() => {{ document.querySelector('.row[data-id=\"{rid}\"]').scrollIntoView({{block:'nearest'}}); hover({json.dumps(rid)}, true); }}")
            else:
                page.evaluate("() => hover(null)")
        return cam_lerp(c0, c1, t / TOTAL)

    record(page, out / "frames_hover", [(TOTAL, seg)], "hover")
    page.close()
    stitch(out / "frames_hover", out / "hover_master.mp4")
    contact_sheet(out / "hover_master.mp4", out / "hover_sheet.jpg")


def zoom(ctx, out):
    """9 s, the real page: from the region down into the second-ranked mountain, the list, panel and profile all live."""
    page = ctx.new_page()
    page.goto(URL, wait_until="networkidle", timeout=120_000)
    wait_ready(page)
    page.add_style_tag(content=CALM_CSS)
    R = rows(page)
    r = R[1]
    print(f"  zoom mountain: #{r['rank']} {r['name']}", flush=True)
    c0 = page.evaluate("() => ({center: map.getCenter().toArray(), zoom: map.getZoom(), pitch: 0, bearing: 0})")
    HOLD, FLY, END = 0.7, 7.0, 1.3
    done = {"sel": False, "cam": None}

    def seg_fly(t):
        if not done["sel"]:
            select_mountain(page, r)
            done["cam"] = mountain_cam(page, r, 80, zoom_off=-0.2)
            done["sel"] = True
        u = t / FLY
        # top-down until the mountain is close, then the tilt and the turn uphill in the last third
        return cam_lerp(c0, done["cam"], ease_in_out(u), pitch_t=smooth((u - 0.62) / 0.38), bearing_t=smooth((u - 0.5) / 0.5))

    record(page, out / "frames_zoom", [(HOLD, lambda t: None), (FLY, seg_fly), (END, lambda t: None)], "zoom")
    page.close()
    stitch(out / "frames_zoom", out / "zoom_master.mp4")
    contact_sheet(out / "zoom_master.mp4", out / "zoom_sheet.jpg")


def stills(browser, out):
    """Four sharp stills at 2x (3840x2160): the overview, the hero's final view full-bleed, a mountain with the whole
    page around it, and a trail hovered on the map with its tooltip and profile."""
    sdir = out / "stills"
    sdir.mkdir(parents=True, exist_ok=True)
    ctx = browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=2)
    page = ctx.new_page()
    page.goto(URL, wait_until="networkidle", timeout=120_000)
    wait_ready(page)
    page.add_style_tag(content=CALM_CSS)
    R = rows(page)
    page.screenshot(path=str(sdir / "01_overview.png"))
    print("  still 01 overview", flush=True)

    r = R[2]
    select_mountain(page, r)
    cam = mountain_cam(page, r, 80, zoom_off=-0.2)
    page.evaluate(STEP_JS, cam)
    time.sleep(0.5)
    page.screenshot(path=str(sdir / "03_mountain_page.png"))
    print(f"  still 03 mountain page: {r['name']}", flush=True)

    # hover a beginner trail on the map: the page's own mousemove handler shows the tooltip, pin and profile
    pt = page.evaluate(f"""() => {{
      const id = {json.dumps(r['id'])};
      const lines = runsOf(id).filter(f => f.geometry.type === 'LineString' && f.properties.cls !== 'rest' && f.properties.draw);
      if (!lines.length) return null;
      const f = lines.reduce((a, b) => a.properties.km >= b.properties.km ? a : b);
      const p = map.project(midOf(f.geometry));
      const b = document.getElementById('map').getBoundingClientRect();
      return {{x: b.left + p.x, y: b.top + p.y, name: f.properties.name, km: f.properties.km}};
    }}""")
    if pt:
        page.mouse.move(pt["x"], pt["y"], steps=12)
        time.sleep(0.8)
        page.mouse.move(pt["x"] + 1, pt["y"], steps=2)
        time.sleep(0.8)
        page.screenshot(path=str(sdir / "04_trail_hover.png"))
        print(f"  still 04 trail hover: {pt['name']} {pt['km']} km", flush=True)
    page.close()

    page = ctx.new_page()
    page.goto(URL, wait_until="networkidle", timeout=120_000)
    wait_ready(page)
    page.add_style_tag(content=FULL_BLEED_CSS)
    page.evaluate("() => map.resize()")
    time.sleep(0.5)
    meta = json.loads((out / "hero_meta.json").read_text()) if (out / "hero_meta.json").exists() else None
    r0 = R[0]
    select_mountain(page, r0)
    end = meta["end"] if meta else dict(mountain_cam(page, r0, {"top": 120, "bottom": 90, "left": 140, "right": 140}, zoom_off=0.3), pitch=60)
    page.evaluate(STEP_JS, end)
    time.sleep(0.5)
    page.screenshot(path=str(sdir / "02_hero_end.png"))
    print("  still 02 hero end", flush=True)
    page.close()
    ctx.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--only", nargs="*", default=["hero", "hover", "zoom", "stills"])
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(args=ARGS)
        ctx = browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=1)
        for name in a.only:
            print(f"[{name}]", flush=True)
            if name == "hero":
                hero(ctx, out)
            elif name == "hover":
                hover(ctx, out)
            elif name == "zoom":
                zoom(ctx, out)
            elif name == "stills":
                stills(browser, out)
        ctx.close()
        browser.close()
    print("done", flush=True)


if __name__ == "__main__":
    sys.exit(main())
