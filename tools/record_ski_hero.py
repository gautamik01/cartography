"""Ski map hero, take two: shaded terrain in every frame. Four resorts' terrain is loaded up front, the page's
coarse hillshade stays on around them (no white skirt), and the camera visits each resort in turn with its
longest beginner trail emphasised, orbiting a little at each stop. Every frame waits for its tiles and is then
checked for blank areas (top and bottom halves must both be mostly shaded) before it is kept.

    python tools/record_ski_hero.py --out ../_temp_sources/ski          # hero_master.mp4, hero_sheet.jpg, card_candidates/, candidates_sheet.jpg
"""
import argparse
import io
import json
import math
import subprocess
import sys
import time
from pathlib import Path

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from record_ski import URL, W, H, FPS, ARGS, FULL_BLEED_CSS, STEP_JS, IDLE_JS, FF, smooth, ease_in_out, lerp, lerp_bearing, cam_lerp, wait_ready, rows, mountain_cam, stitch, contact_sheet  # noqa

STOPS = ["Windham", "Hunter Mountain", "Belleayre", "Jiminy Peak"]   # by short name, in visiting order
HOLD, MOVE, END = 2.6, 3.4, 0.9
PITCH_STOP, ORBIT_DEG = 48, 14                      # at a stop the sharp terrain fills the frame; a move rises to the regional relief
ZOOM_STOP = 15.0                                    # the page's own ceiling
TILT_FROM = 13.4                                    # below this zoom the camera looks straight down (the sharp tiles no longer fill the view)
APEX_NEAR, APEX_FAR = 9.4, 9.0                      # every move rises to where the regional relief picture is fully drawn, a long hop a little higher
BLANK_WHITE, MIN_SHADED = 240, 0.35
RETRIES, RETRY_S = 6, 0.3


def setup(page, picks):
    """Load the four mountains' terrain, keep the coarse terrain and hillshade around them, hide the overview marks."""
    for r in picks:
        for attempt in range(4):              # the terrain files come from GitHub Pages; a fetch now and then fails
            try:
                page.evaluate(f"() => loadHi({json.dumps(r['id'])})")
                break
            except Exception as e:
                print(f"  loadHi {r['name']} attempt {attempt + 1}: {str(e)[:80]}", flush=True)
                time.sleep(3)
        else:
            raise RuntimeError(f"terrain for {r['name']} never loaded")
    page.evaluate("""() => {
      map.setTerrain({source: 'dem', exaggeration: EX});
      focus = null; refreshDem();
      // the regional relief picture stays draped at every zoom (soft, but never blank) and the coarse hillshade,
      // which renders as blocky tiles once pitched and zoomed in, stays off; the sharp resort tiles draw above it
      if (map.getLayer('relief')) map.setPaintProperty('relief', 'raster-opacity', 1);
      if (map.getLayer('shade')) map.setLayoutProperty('shade', 'visibility', 'none');
      for (const k in markers) markers[k].getElement().classList.add('gone');
      for (const c of cityMarks) c.getElement().classList.add('gone');
      map.setPaintProperty('bg', 'background-color', '#ececec');
      map.dragRotate.enable();
    }""")
    page.evaluate(IDLE_JS, 12000)


def emphasise(page, r):
    page.evaluate(f"() => {{ pinnedT = longestBeginner({json.dumps(r['id'])}); hoverT = null; paintEmphasis(); }}")


def shaded_fractions(png_bytes):
    im = Image.open(io.BytesIO(png_bytes)).convert("RGB")
    w, h = im.size
    small = im.resize((64, 36), Image.BOX)
    px = small.load()
    def frac(y0, y1):
        n = s = 0
        for y in range(y0, y1):
            for x in range(64):
                n += 1
                if min(px[x, y]) < BLANK_WHITE:
                    s += 1
        return s / n
    return frac(0, 18), frac(18, 36)


def record(page, frames_dir, plan, label):
    frames_dir.mkdir(parents=True, exist_ok=True)
    for old in frames_dir.glob("*.jpg"):
        old.unlink()
    n = int(round(sum(d for d, _ in plan) * FPS))
    t0 = time.time()
    i = 0
    worst = (1.0, 1.0)
    retried = 0
    for seg_len, fn in plan:
        for j in range(int(round(seg_len * FPS))):
            cam = fn(j / FPS)
            page.evaluate(STEP_JS, cam)
            for attempt in range(RETRIES + 1):
                shot = page.screenshot(type="jpeg", quality=94)
                top, bottom = shaded_fractions(shot)
                if top >= MIN_SHADED and bottom >= MIN_SHADED:
                    break
                retried += 1
                time.sleep(RETRY_S)
                page.evaluate(STEP_JS, None)
            worst = (min(worst[0], top), min(worst[1], bottom))
            (frames_dir / f"frame_{i:05d}.jpg").write_bytes(shot)
            i += 1
            if i % 90 == 0:
                print(f"  {label}: {i}/{n} frames, {time.time() - t0:.0f}s, worst shaded top {worst[0]:.2f} bottom {worst[1]:.2f}, retries {retried}", flush=True)
    print(f"  {label}: {i} frames in {time.time() - t0:.0f}s; worst shaded fraction top {worst[0]:.2f} bottom {worst[1]:.2f}; {retried} retakes", flush=True)


def hero(ctx, out):
    page = ctx.new_page()
    page.goto(URL, wait_until="networkidle", timeout=120_000)
    wait_ready(page)
    R = rows(page)
    picks = [next(r for r in R if r["name"] == name) for name in STOPS]
    print("  stops: " + ", ".join(f"#{r['rank']} {r['name']} (bearing {r['bearing']})" for r in picks), flush=True)
    page.add_style_tag(content=FULL_BLEED_CSS)
    page.evaluate("() => map.resize()")
    time.sleep(0.5)
    setup(page, picks)
    pad = {"top": 120, "bottom": 90, "left": 140, "right": 140}
    cams = [dict(mountain_cam(page, r, pad, zoom_off=0.0), pitch=PITCH_STOP) for r in picks]
    for c in cams:
        c["zoom"] = ZOOM_STOP
    print("  stop cameras: " + "; ".join(f"z{c['zoom']:.2f} b{c['bearing']:.0f}" for c in cams), flush=True)
    plan = []
    state = {"stop": -1}

    def make_hold(k):
        def seg(t):
            if state["stop"] != k:
                state["stop"] = k
                emphasise(page, picks[k])
            u = t / HOLD
            c = cams[k]
            return dict(c, bearing=lerp_bearing(c["bearing"] - ORBIT_DEG / 2, c["bearing"] + ORBIT_DEG / 2, smooth(u)))
        return seg

    def make_move(k):
        a, b = cams[k], cams[k + 1]
        a_end = dict(a, bearing=lerp_bearing(a["bearing"] - ORBIT_DEG / 2, a["bearing"] + ORBIT_DEG / 2, 1.0))
        b_start = dict(b, bearing=lerp_bearing(b["bearing"] - ORBIT_DEG / 2, b["bearing"] + ORBIT_DEG / 2, 0.0))
        dlon = (b["center"][0] - a["center"][0]) * math.cos(math.radians(a["center"][1]))
        km = math.hypot(dlon, b["center"][1] - a["center"][1]) * 111.3
        apex = lerp(APEX_NEAR, APEX_FAR, smooth((km - 15) / 100))      # a short hop rises to 9.4, a 115 km hop to 9.0

        def seg(t):
            u = t / MOVE
            c = cam_lerp(a_end, b_start, ease_in_out(u))
            arc = math.sin(math.pi * u) ** 0.45              # out fast, a long glide over the relief, in fast: little time in the blurry middle zooms
            c["zoom"] = lerp(c["zoom"], apex, arc)
            # straight down through the zone where the stretched relief would smear: tilt only inside the sharp tiles
            c["pitch"] = PITCH_STOP * smooth((c["zoom"] - TILT_FROM) / (ZOOM_STOP - TILT_FROM))
            return c
        return seg

    for k in range(len(cams)):
        plan.append((HOLD, make_hold(k)))
        if k < len(cams) - 1:
            plan.append((MOVE, make_move(k)))
    plan.append((END, lambda t: None))
    record(page, out / "frames_hero2", plan, "hero")
    stitch(out / "frames_hero2", out / "hero_master.mp4")
    contact_sheet(out / "hero_master.mp4", out / "hero_sheet.jpg")
    page.close()
    if SKIP_CANDIDATES:
        return

    # three card candidates at 2x: a tilted close-up of a resort with its emphasised trail
    cdir = out / "card_candidates"
    cdir.mkdir(exist_ok=True)
    ctx2 = ctx.browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=2)
    page = ctx2.new_page()
    page.goto(URL, wait_until="networkidle", timeout=120_000)
    wait_ready(page)
    page.add_style_tag(content=FULL_BLEED_CSS)
    page.evaluate("() => map.resize()")
    time.sleep(0.5)
    setup(page, picks)
    cands = [(picks[3], 15.0, 46, 0), (picks[0], 15.0, 50, -20), (picks[2], 15.0, 52, 15)]
    sheets = []
    for n, (r, zoom, pitch, boff) in enumerate(cands, 1):
        emphasise(page, r)
        c = dict(mountain_cam(page, r, pad, zoom_off=0.0), pitch=pitch)
        c["bearing"] = (c["bearing"] + boff) % 360
        c["zoom"] = zoom
        page.evaluate(STEP_JS, c)
        for attempt in range(RETRIES + 1):
            shot = page.screenshot()
            top, bottom = shaded_fractions(shot)
            if top >= MIN_SHADED and bottom >= MIN_SHADED:
                break
            time.sleep(RETRY_S)
            page.evaluate(STEP_JS, None)
        f = cdir / f"cand_{n}.png"
        f.write_bytes(shot)
        print(f"  candidate {n}: {r['name']} z{c['zoom']:.2f} pitch {pitch}, shaded top {top:.2f} bottom {bottom:.2f}", flush=True)
        sheets.append((f, f"{n}: {r['name']} z{c['zoom']:.1f} p{pitch}"))
    page.close()
    ctx2.close()
    # the sheet shows each candidate's centre 4:5 crop, as the card would be
    cw, ch = 480, 600
    sheet = Image.new("RGB", (3 * (cw + 12) + 12, ch + 40), (40, 40, 40))
    dr = ImageDraw.Draw(sheet)
    for i, (f, label) in enumerate(sheets):
        im = Image.open(f).convert("RGB")
        w, h = im.size
        cwid = round(h * 0.8)
        crop = im.crop(((w - cwid) // 2, 0, (w - cwid) // 2 + cwid, h)).resize((cw, ch), Image.LANCZOS)
        sheet.paste(crop, (12 + i * (cw + 12), 12))
        dr.text((12 + i * (cw + 12), ch + 18), label, fill=(230, 230, 230))
    sheet.save(out / "candidates_sheet.jpg", quality=88)
    print("  candidates sheet", out / "candidates_sheet.jpg", flush=True)


SKIP_CANDIDATES = False


def main():
    global SKIP_CANDIDATES
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--skip-candidates", action="store_true")
    a = ap.parse_args()
    SKIP_CANDIDATES = a.skip_candidates
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(args=ARGS)
        ctx = browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=1)
        print("[hero2]", flush=True)
        hero(ctx, out)
        ctx.close()
        browser.close()
    print("done", flush=True)


if __name__ == "__main__":
    sys.exit(main())
