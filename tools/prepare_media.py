"""
prepare_media.py : curated presentation media for assets/projects/<slug>/.

Sources never live in this repo. GitHub files and Playwright captures sit in
../_temp_sources/ (one level above the repo), Forested University renders are
read from a local folder. Outputs are deterministic, so the script can be run
again at any time; it skips outputs that are newer than their source.

    pip install pillow imageio-ffmpeg
    python tools/prepare_media.py              # build what is missing or stale
    python tools/prepare_media.py --force      # rebuild everything
    python tools/prepare_media.py --fetch      # (re)download the GitHub sources first
    python tools/prepare_media.py --sheet      # also write _temp/contact_sheet.jpg
    python tools/prepare_media.py --only raasta map-series

Images: WebP, max 2400px long edge, quality 82.
Videos: H.264 MP4, max 1920px wide, CRF 26, preset veryfast, no audio, faststart,
        under 15MB, each with a WebP poster.
"""
import argparse
import io
import subprocess
import sys
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

REPO = Path(__file__).resolve().parents[1]
ASSETS = REPO / "assets" / "projects"
TEMP = REPO.parent / "_temp_sources"          # outside the repo, deleted after a build
SHOTS = TEMP / "shots"                        # written by tools/shoot_portals.py
SKI = TEMP / "ski"                            # the ski map recordings made here (stills/, card_candidates/), read only
SKI_SRC = Path(r"D:\00_MUSA_EVERTHING\Gautami_Portfolio\gautami_apple\Some Material\Ski")   # Gautami's own ski clips, read only
CLOUD = TEMP / "cloud"                        # the day01 map recording (hero_master.mp4, still_card.png)
FOREST = Path(r"D:\00_MUSA_EVERTHING\Gautami_Portfolio\gautami_apple\Some Material\Forested_University")
RAASTA_DEMO = Path(r"D:\00_MUSA_EVERTHING\GEN_AI_Studio\raasta\demo-video")   # read only, never modified

IMG_MAX = 2400
WEBP_Q = 82
# video: H.264, sharpness first and size second. Full-screen openers keep 1920 px (never upscaled) at CRF 22; clips beside
# text or in galleries are 1600 px at most at CRF 23; every clip also gets a 720 px mobile copy at CRF 24. All at preset
# slow, no audio, faststart, a keyframe every 2 s. Posters are the encoded file's exact first frame. A per-clip `crf`
# override lowers a setting where a frame comparison showed labels or thin lines going soft.
VID_HERO_W, VID_HERO_CRF = 1920, 22
VID_MAX_W, VID_CRF = 1600, 23
VID_MOBILE_W, VID_MOBILE_CRF = 720, 24
VID_MAX_FPS = 30
VID_PRESET = "slow"
VID_GOP_S = 2
VID_SEAM_S = 0.3           # the last 0.3 s of a clip crossfades into its start, so the loop has no jump

CARD = 4 / 5
HERO = 16 / 9

GH = "https://raw.githubusercontent.com/gautamik01/30-day-map-challenge-2026"
FETCH = [
    ("main", "output/day02_lines-big-sur.png"),
    ("main", "output/day03_polygons-sf-zoning.png"),
    ("main", "output/day05_sight-billy-penn.png"),
    ("main", "output/day06_vintage-bombay-islands.png"),
    ("main", "output/day07_ten-minute-parks-philly.png"),
    ("main", "png_thumbnail/day03_polygons-water-ai.png"),
    ("main", "output/day01_points-ai_2.mp4"),
    ("main", "output/maps.json"),
    ("main", "scripts/mapkit/style.py"),
    ("week1-maps", "output/day21_terrain_blue_mountain_resort_shade.jpg"),
]

# ------------------------------------------------------------------ the manifest
# box = (left, top, right, bottom) in source pixels. The box is trimmed to the exact
# aspect from its centre, so a box that is a few pixels off still yields a true 4:5 or 16:9.
# pad=True extends the canvas with the border colour instead of cropping (flat backgrounds only).

def img(src, out, aspect=None, box=None, pad=False, contrast=False):
    """contrast=True stretches the levels (1% cutoff) for a pale capture such as the ski map's snow hillshade."""
    return dict(kind="image", src=src, out=out, aspect=aspect, box=box, pad=pad, contrast=contrast)

def vid(src, out, poster_t=0.0, hero=False, seam=True, crf=None):
    """hero=True: a full-screen opener (1920 px, CRF 22); otherwise 1600 px, CRF 23. crf overrides the desktop CRF
    (the mobile copy follows, one step higher). seam=True crossfades the tail into the head so the loop flows."""
    return dict(kind="video", src=src, out=out, poster_t=poster_t, hero=hero, seam=seam, crf=crf)

def still(src, t, out, aspect=None, box=None, pad=False):
    """A single frame of a video, treated like an image."""
    return dict(kind="still", src=src, t=t, out=out, aspect=aspect, box=box, pad=pad)


def loop(src_a, src_b, out, hold=2.0, fade=1.2):
    """A looping crossfade between two stills (a season change): hold A, fade to B, hold B, fade back. The MP4 ends on
    A so the loop is seamless by construction; the poster is the first frame. Transparent stills are flattened on paper."""
    return dict(kind="loop", src=src_a, src_b=src_b, out=out, hold=hold, fade=fade)

# Work-view tiles: 4:5 crops at three scales per project (wide, mid, close). data/work.json lists which
# file is which. Where the card is already the right crop, work.json points at card.webp instead.
TILES = {
    "raasta": [
        img(SHOTS / "raasta_route_1440x900.png", "tile-mid.webp", CARD, box=(1150, 0, 2590, 1800)),
        # close: one callout at the City Hall fountain, its pin and the route's end
        img(SHOTS / "raasta_route_1440x900.png", "tile-close.webp", CARD, box=(2040, 280, 2840, 1280)),
    ],
    "ski-terrain": [
        # the overview's map column only (no page UI), Jiminy Peak from the hero clip's map column, and Belleayre's slopes close up
        img(SKI / "stills/01_overview.png", "tile-wide.webp", CARD, box=(1300, 0, 3028, 2160)),
        still(SKI_SRC / "ski-hero.mp4", 11.6, "tile-mid.webp", CARD, box=(568, 0, 1432, 1080)),
        img(SKI / "card_candidates/cand_3.png", "tile-close.webp", CARD, box=(1272, 270, 2568, 1890), contrast=True),
    ],
    "forested-university": [
        img(FOREST / "BIE_241216 Aerial view Zoom.png", "tile-wide.webp", CARD, box=(1200, 40, 4100, 3665)),
        # the exploded housing block, padded with its own pink to 4:5 (the card used to be this frame)
        still(FOREST / "Forest student housing exploded.mp4", 4.9, "tile-mid.webp", CARD, pad=True),
        still(FOREST / "Human experiences.mp4", 2.2, "tile-close.webp", CARD, box=(0, 150, 464, 730)),
        still(FOREST / "Human Scale experience.mp4", 3.9, "tile-close-2.webp", CARD, box=(0, 180, 464, 760)),
    ],
    "cloud-footprint": [
        img(SHOTS / "day01_points-ai_1600x1000.png", "tile-wide.webp", CARD, box=(720, 0, 2320, 2000)),
        img(SHOTS / "day01_points-ai_1600x1000.png", "tile-close.webp", CARD, box=(1500, 900, 2300, 1900)),
    ],
    "map-series": [
        # map bodies only: below each title block, above each legend or credit line
        img(TEMP / "output/day03_polygons-sf-zoning.png", "tile-wide.webp", CARD, box=(200, 290, 888, 1150)),
        img(TEMP / "output/day07_ten-minute-parks-philly.png", "tile-mid.webp", CARD, box=(230, 280, 830, 1030)),
        img(TEMP / "output/day05_sight-billy-penn.png", "tile-mid-2.webp", CARD, box=(240, 240, 1040, 1240)),
    ],
}

MANIFEST = {
    "raasta": [
        # 3D route view, skyline and speech bubbles, panel cropped away
        img(SHOTS / "raasta_route_3d_1440x900.png", "card.webp", CARD, box=(1116, 0, 2556, 1800)),
        # hero: map only (panel and zoom controls cropped away), skyline tops kept
        img(SHOTS / "raasta_route_3d_1440x900.png", "hero.webp", HERO, box=(880, 130, 2760, 1187)),
        # lead: the route with all three callouts and both ends whole, no dashboard (shown whole beside the text)
        img(SHOTS / "raasta_route_1440x900.png", "lead.webp", box=(1100, 280, 2760, 1480)),
        img(SHOTS / "raasta_landing_1440x900.png", "landing.webp"),
        img(SHOTS / "raasta_route_1440x900.png", "route.webp"),
        img(SHOTS / "raasta_route_3d_1440x900.png", "route-3d.webp"),
        # demo clips: clip-2 is the opener, clip-1 the portal button's window, clip-1 and clip-3 the gallery
        vid(RAASTA_DEMO / "raasta-clip-1.mp4", "clip-1.mp4", poster_t=0.0),
        # the opener at CRF 22 came out at 40 MB (about 15 Mbps) and would rebuffer on slow connections; CRF 26 keeps it near 15 MB
        vid(RAASTA_DEMO / "raasta-clip-2.mp4", "clip-2.mp4", poster_t=0.0, hero=True, crf=26),
        vid(RAASTA_DEMO / "raasta-clip-3.mp4", "clip-3.mp4", poster_t=0.0),
    ],
    "ski-terrain": [
        # recorded from the live map by tools/record_ski.py and record_ski_hero.py (Playwright, 1920x1080, 30 fps frames
        # stitched; stills at 2x). The hero visits Windham, Hunter, Belleayre and Jiminy Peak with a trail highlighted at each.
        # Gautami's own clips (2026-11-11): the hero is the opener, the snippet loops beside the text as the lead; posters are first frames
        vid(SKI_SRC / "ski-hero.mp4", "hero.mp4", poster_t=0.0, hero=True),
        vid(SKI_SRC / "ski-snippet-2.mp4", "lead.mp4", poster_t=0.0),
        # card: a strong frame of the hero (Jiminy Peak, a trail highlighted), the map column cropped 4:5
        still(SKI_SRC / "ski-hero.mp4", 14.0, "card.webp", CARD, box=(568, 0, 1432, 1080)),
        img(SKI / "stills/03_mountain_page.png", "mountain.webp"),
        img(SKI / "stills/04_trail_hover.png", "trail.webp"),
    ],
    "forested-university": [
        # card: the aerial drawing, the same 4:5 window as the wide tile
        img(FOREST / "BIE_241216 Aerial view Zoom.png", "card.webp", CARD, box=(1200, 40, 4100, 3665)),
        # opener: the whole aerial, cover-fitted on the page with the focal point at 40% 40% (projects.json opener_focus)
        img(FOREST / "BIE_241216 Aerial view Zoom.png", "aerial.webp"),
        # lead: a looping season change beside the text, summer to autumn and back, from the two Heverlee views
        loop(FOREST / "20231212 Heverlee - View 1.png", FOREST / "20231212 Heverlee - View 1 - autumn.png", "season.mp4"),
        # posters are the exact first frame, so a clip starts where its poster was
        vid(FOREST / "Forest Campus..mp4", "campus.mp4", poster_t=0.0),
        vid(FOREST / "Forest student housing exploded.mp4", "housing-exploded.mp4", poster_t=0.0),
        # the two walkthroughs came out a touch softer than before at CRF 23 (edge energy 0.93 and 0.99 of the old), so two lower
        vid(FOREST / "Human experiences.mp4", "atrium.mp4", poster_t=0.0, crf=21),
        vid(FOREST / "Human Scale experience.mp4", "winter-street.mp4", poster_t=0.0, crf=21),
        vid(FOREST / "The forest campus .mp4", "montage.mp4", poster_t=0.0),
    ],
    "cloud-footprint": [
        # hero: a 13 s recording from the live day01 map (scratch cloud_record2.py): a cursor rests on a pink, a yellow and a
        # blue dot so each one's card opens; card: the pink campus with its card open, at 2x, centre 4:5; lead: What AI Drinks
        vid(CLOUD / "hero_master.mp4", "hero.mp4", poster_t=0.0, hero=True),
        img(CLOUD / "still_card.png", "card.webp", CARD, box=(1340, 0, 3068, 2160)),   # the cursor, the dot and its whole card
        img(TEMP / "png_thumbnail/day03_polygons-water-ai.png", "lead.webp", CARD, box=(512, 0, 1312, 1000)),
        img(SHOTS / "day01_points-ai_1600x1000.png", "where-ai-gets-built.webp"),
        img(TEMP / "png_thumbnail/day03_polygons-water-ai.png", "what-ai-drinks.webp"),
    ],
    "map-series": [
        # card: Big Sur contours and the red course around Hurricane Point, no title block
        img(TEMP / "output/day02_lines-big-sur.png", "card.webp", CARD, box=(346, 189, 1080, 1107)),
        img(TEMP / "output/day03_polygons-sf-zoning.png", "hero.webp", HERO, box=(0, 400, 1080, 1007)),
        img(TEMP / "output/day02_lines-big-sur.png", "lead.webp"),
        img(TEMP / "output/day02_lines-big-sur.png", "big-sur.webp"),
        img(TEMP / "output/day03_polygons-sf-zoning.png", "sf-zoning.webp"),
        img(TEMP / "output/day05_sight-billy-penn.png", "billy-penn.webp"),
        img(TEMP / "output/day06_vintage-bombay-islands.png", "bombay.webp"),
        img(TEMP / "output/day07_ten-minute-parks-philly.png", "philly-parks.webp"),
        img(TEMP / "output/day04_clusters-nyc-indian.png", "nyc-indian.webp"),
    ],
}


# ------------------------------------------------------------------ helpers
def ffmpeg_exe():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def fetch():
    for branch, rel in FETCH:
        dest = TEMP / rel.replace("scripts/mapkit", "mapkit")
        if branch != "main":
            dest = TEMP / branch.replace("-maps", "") / Path(rel).name
        dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.exists():
            print("  have   ", dest.relative_to(TEMP))
            continue
        url = f"{GH}/{branch}/{rel}"
        print("  fetch  ", url)
        urllib.request.urlretrieve(url, dest)


def stale(out, *sources):
    if not out.exists():
        return True
    return any(s.exists() and s.stat().st_mtime > out.stat().st_mtime for s in sources)


def border_colour(im):
    """Median colour of the outer 2% of pixels, for padding flat backgrounds."""
    w, h = im.size
    m = max(2, int(min(w, h) * 0.02))
    strips = [im.crop((0, 0, w, m)), im.crop((0, h - m, w, h)), im.crop((0, 0, m, h)), im.crop((w - m, 0, w, h))]
    raw = b"".join(s.convert("RGB").tobytes() for s in strips)
    chans = [sorted(raw[i::3]) for i in range(3)]
    return tuple(c[len(c) // 2] for c in chans)


def to_aspect(im, aspect, box=None, pad=False):
    if box:
        im = im.crop(box)
    if aspect is None:
        return im
    w, h = im.size
    if pad:
        if w / h < aspect:
            canvas = Image.new("RGB", (round(h * aspect), h), border_colour(im))
            canvas.paste(im, ((canvas.width - w) // 2, 0))
        else:
            canvas = Image.new("RGB", (w, round(w / aspect)), border_colour(im))
            canvas.paste(im, (0, (canvas.height - h) // 2))
        return canvas
    # trim to exact aspect from the centre
    if w / h > aspect:
        nw = round(h * aspect); x = (w - nw) // 2
        return im.crop((x, 0, x + nw, h))
    nh = round(w / aspect); y = (h - nh) // 2
    return im.crop((0, y, w, y + nh))


PAPER = (231, 228, 224)


def save_webp(im, out):
    im = ImageOps.exif_transpose(im)
    if im.mode in ("RGBA", "LA", "P") and "transparency" in im.info or im.mode in ("RGBA", "LA"):
        # a drawing with a transparent ground (the Forested section) sits on the site's paper, not on black
        rgba = im.convert("RGBA")
        base = Image.new("RGBA", rgba.size, PAPER + (255,))
        im = Image.alpha_composite(base, rgba)
    im = im.convert("RGB")
    im.thumbnail((IMG_MAX, IMG_MAX), Image.LANCZOS)
    out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out, "WEBP", quality=WEBP_Q, method=6)
    return im.size


def frame_at(src, t):
    """One frame of a video as a PIL image, via ffmpeg's png pipe."""
    cmd = [ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-ss", f"{t:.3f}", "-i", str(src),
           "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "-"]
    data = subprocess.run(cmd, check=True, capture_output=True).stdout
    return Image.open(io.BytesIO(data))


def probe(src):
    """(duration in seconds, frames per second) from ffmpeg's banner."""
    err = subprocess.run([ffmpeg_exe(), "-hide_banner", "-i", str(src)], capture_output=True, text=True).stderr
    dur, fps = 0.0, 30.0
    for line in err.splitlines():
        if "Duration:" in line:
            h, m, s = line.split("Duration:")[1].split(",")[0].strip().split(":")
            dur = int(h) * 3600 + int(m) * 60 + float(s)
        if "Video:" in line and " fps" in line:
            fps = float(line.split(" fps")[0].rsplit(",", 1)[-1].strip())
    return dur, fps


def x264_args(crf, fps):
    gop = max(1, round(VID_GOP_S * fps))
    return ["-c:v", "libx264", "-preset", VID_PRESET, "-crf", str(crf), "-g", str(gop), "-keyint_min", str(gop), "-sc_threshold", "0",
            "-pix_fmt", "yuv420p", "-movflags", "+faststart"]


def encode_video(src, out, width, crf, seam=True):
    """One H.264 file of at most `width` px (never upscaled) at the given CRF. With seam, the last VID_SEAM_S of the
    clip is crossfaded into its first VID_SEAM_S, so the loop point has no jump: the output then starts VID_SEAM_S
    in and ends on that same frame."""
    dur, src_fps = probe(src)
    fps = min(VID_MAX_FPS, src_fps)
    base = f"scale='min({width},iw)':-2:flags=lanczos,fps={fps:g},format=yuv420p"
    if seam and dur > 4 * VID_SEAM_S:
        off = dur - 2 * VID_SEAM_S
        graph = (f"[0:v]{base},split=2[s0][s1];[s0]trim=start={VID_SEAM_S},setpts=PTS-STARTPTS[a];"
                 f"[s1]trim=end={VID_SEAM_S},setpts=PTS-STARTPTS[b];[a][b]xfade=transition=fade:duration={VID_SEAM_S}:offset={off:.3f}[v]")
    else:
        graph = f"[0:v]{base}[v]"
    cmd = [ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-y", "-i", str(src), "-an",
           "-filter_complex", graph, "-map", "[v]", *x264_args(crf, fps), str(out)]
    subprocess.run(cmd, check=True)
    return crf


def flatten_on_paper(src, dest):
    """A still with transparency, composited on the site's paper, as a PNG outside the repo."""
    with Image.open(src) as im:
        rgba = im.convert("RGBA")
        base = Image.new("RGBA", rgba.size, PAPER + (255,))
        dest.parent.mkdir(parents=True, exist_ok=True)
        Image.alpha_composite(base, rgba).convert("RGB").save(dest, "PNG")
    return dest


def encode_loop(job, out, width, crf):
    """A -> B -> A crossfade loop with ffmpeg's xfade: A holds, fades to B, B holds, fades back to A."""
    hold, fade = job["hold"], job["fade"]
    a = flatten_on_paper(job["src"], TEMP / "loops" / (Path(job["src"]).stem + ".png"))
    b = flatten_on_paper(job["src_b"], TEMP / "loops" / (Path(job["src_b"]).stem + ".png"))
    la, lb, lc = hold + fade, fade + hold + fade, fade          # A: hold then fade out; B: fade in, hold, fade out; A again: fade in
    off1, off2 = hold, la + lb - fade - fade                   # where each crossfade starts on the output timeline
    scale = f"scale='min({width},iw)':-2:flags=lanczos,format=yuv420p"
    graph = (f"[0:v]{scale}[a];[1:v]{scale}[b];[2:v]{scale}[c];"
             f"[a][b]xfade=transition=fade:duration={fade}:offset={off1}[ab];"
             f"[ab][c]xfade=transition=fade:duration={fade}:offset={off2}[v]")
    cmd = [ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-y",
           "-loop", "1", "-framerate", "30", "-t", f"{la}", "-i", str(a),
           "-loop", "1", "-framerate", "30", "-t", f"{lb}", "-i", str(b),
           "-loop", "1", "-framerate", "30", "-t", f"{lc}", "-i", str(a),
           "-filter_complex", graph, "-map", "[v]", "-an", *x264_args(crf, 30), str(out)]
    subprocess.run(cmd, check=True)


def build(slug, job, force):
    out_dir = ASSETS / slug
    out = out_dir / job["out"]
    src = Path(job["src"])
    if not src.exists():
        print(f"  MISSING {src}")
        return
    if job["kind"] == "image":
        if not force and not stale(out, src):
            print(f"  ok     {slug}/{out.name}")
            return
        with Image.open(src) as im:
            keep_alpha = im.mode in ("RGBA", "LA")          # save_webp composites a transparent drawing on paper
            im = to_aspect(im if keep_alpha else im.convert("RGB"), job["aspect"], job["box"], job["pad"])
            if job.get("contrast"):
                im = ImageOps.autocontrast(im, cutoff=1)
            size = save_webp(im, out)
        print(f"  image  {slug}/{out.name}  {size[0]}x{size[1]}  {out.stat().st_size // 1024} KB")
    elif job["kind"] == "still":
        if not force and not stale(out, src):
            print(f"  ok     {slug}/{out.name}")
            return
        im = to_aspect(frame_at(src, job["t"]).convert("RGB"), job["aspect"], job["box"], job["pad"])
        size = save_webp(im, out)
        print(f"  still  {slug}/{out.name}  {size[0]}x{size[1]}  {out.stat().st_size // 1024} KB")
    elif job["kind"] == "loop":
        poster = out.with_name(out.stem + "-poster.webp")
        mobile = out.with_name(out.stem + "-720.mp4")
        src_b = Path(job["src_b"])
        if force or stale(out, src, src_b):
            out_dir.mkdir(parents=True, exist_ok=True)
            encode_loop(job, out, VID_MAX_W, VID_CRF)
            encode_loop(job, mobile, VID_MOBILE_W, VID_MOBILE_CRF)
            print(f"  loop   {slug}/{out.name}  crf {VID_CRF}  {out.stat().st_size // 1024} KB  (720 crf {VID_MOBILE_CRF}: {mobile.stat().st_size // 1024} KB)")
        else:
            print(f"  ok     {slug}/{out.name}")
        if force or stale(poster, src, src_b):
            size = save_webp(frame_at(out, 0.0), poster)
            print(f"  poster {slug}/{poster.name}  {size[0]}x{size[1]}  {poster.stat().st_size // 1024} KB")
    elif job["kind"] == "video":
        poster = out.with_name(out.stem + "-poster.webp")
        mobile = out.with_name(out.stem + "-720.mp4")
        width, crf = (VID_HERO_W, VID_HERO_CRF) if job.get("hero") else (VID_MAX_W, VID_CRF)
        if job.get("crf") is not None:
            crf = job["crf"]
        crf_m = VID_MOBILE_CRF + (crf - (VID_HERO_CRF if job.get("hero") else VID_CRF))   # a lowered desktop CRF lowers the mobile one too
        if force or stale(out, src):
            out_dir.mkdir(parents=True, exist_ok=True)
            encode_video(src, out, width, crf, job.get("seam", True))
            encode_video(src, mobile, VID_MOBILE_W, crf_m, job.get("seam", True))
            print(f"  video  {slug}/{out.name}  {width}px crf {crf}  {out.stat().st_size // 1024} KB  (720 crf {crf_m}: {mobile.stat().st_size // 1024} KB)")
        else:
            print(f"  ok     {slug}/{out.name}")
        if force or stale(poster, src):
            size = save_webp(frame_at(out, 0.0), poster)      # the encoded file's own first frame, so poster and playback match exactly
            print(f"  poster {slug}/{poster.name}  {size[0]}x{size[1]}  {poster.stat().st_size // 1024} KB")


def contact_sheet(slugs, dest):
    """Every card next to its hero, one row per project."""
    try:
        font = ImageFont.truetype("arial.ttf", 22)
    except OSError:
        font = ImageFont.load_default()
    CARD_W, HERO_W, GAP, LABEL = 360, 880, 24, 40
    rows = []
    for slug in slugs:
        d = ASSETS / slug
        card = Image.open(d / "card.webp").convert("RGB") if (d / "card.webp").exists() else None
        hero = Image.open(d / "hero.webp").convert("RGB") if (d / "hero.webp").exists() else None
        if card:
            card = card.resize((CARD_W, round(card.height * CARD_W / card.width)), Image.LANCZOS)
        if hero:
            hero = hero.resize((HERO_W, round(hero.height * HERO_W / hero.width)), Image.LANCZOS)
        rows.append((slug, card, hero))
    row_h = max([(r[1].height if r[1] else 0) for r in rows] + [(r[2].height if r[2] else 0) for r in rows]) + LABEL + GAP
    sheet = Image.new("RGB", (GAP + CARD_W + GAP + HERO_W + GAP, row_h * len(rows) + GAP), (231, 228, 224))
    draw = ImageDraw.Draw(sheet)
    y = GAP
    for slug, card, hero in rows:
        draw.text((GAP, y), f"{slug}   card 4:5 / hero 16:9", fill=(11, 11, 11), font=font)
        if card:
            sheet.paste(card, (GAP, y + LABEL))
        if hero:
            sheet.paste(hero, (GAP + CARD_W + GAP, y + LABEL))
        y += row_h
    dest.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(dest, quality=88)
    print("sheet  ", dest, sheet.size)


def tiles_sheet(dest):
    """The work-view tiles from data/work.json, grouped by project, with their scale and label."""
    import json
    tiles = json.loads((REPO / "data" / "work.json").read_text(encoding="utf-8"))
    projects = {p["slug"]: p for p in json.loads((REPO / "data" / "projects.json").read_text(encoding="utf-8"))}
    try:
        font = ImageFont.truetype("arial.ttf", 20)
        small = ImageFont.truetype("arial.ttf", 15)
    except OSError:
        font = small = ImageFont.load_default()
    TILE_W, GAP, HEAD, FOOT = 260, 20, 44, 46
    groups = {}
    for t in tiles:
        groups.setdefault(t["project"], []).append(t)
    row_h = HEAD + round(TILE_W * 1.25) + FOOT
    width = GAP + max(len(g) for g in groups.values()) * (TILE_W + GAP)
    sheet = Image.new("RGB", (width, row_h * len(groups) + GAP), (231, 228, 224))
    draw = ImageDraw.Draw(sheet)
    y = GAP
    for slug, group in groups.items():
        p = projects.get(slug, {})
        note = "" if p.get("published", True) else "   (unpublished, hidden until published)"
        draw.text((GAP, y), f"{slug}   {p.get('title', '')}{note}", fill=(11, 11, 11), font=font)
        for i, t in enumerate(group):
            x = GAP + i * (TILE_W + GAP)
            path = REPO / t["src"]
            if path.exists():
                im = Image.open(path).convert("RGB")
                im = im.resize((TILE_W, round(im.height * TILE_W / im.width)), Image.LANCZOS)
                sheet.paste(im, (x, y + HEAD))
            else:
                draw.rectangle((x, y + HEAD, x + TILE_W, y + HEAD + round(TILE_W * 1.25)), outline=(11, 11, 11))
            draw.text((x, y + HEAD + round(TILE_W * 1.25) + 6), f"{t['scale']}   {Path(t['src']).name}", fill=(11, 11, 11), font=small)
            draw.text((x, y + HEAD + round(TILE_W * 1.25) + 24), t.get("label", ""), fill=(90, 90, 90), font=small)
        y += row_h
    dest.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(dest, quality=88)
    print("tiles  ", dest, sheet.size)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--sheet", action="store_true")
    ap.add_argument("--tiles-sheet", action="store_true")
    ap.add_argument("--only", nargs="*", default=None)
    ap.add_argument("--videos", action="store_true", help="only the video and loop jobs")
    a = ap.parse_args()

    if a.fetch:
        TEMP.mkdir(parents=True, exist_ok=True)
        fetch()
    slugs = a.only or list(MANIFEST)
    for slug in slugs:
        print(f"[{slug}]")
        for job in MANIFEST[slug] + TILES.get(slug, []):
            if a.videos and job["kind"] not in ("video", "loop"):
                continue
            build(slug, job, a.force)
    if a.sheet:
        contact_sheet(list(MANIFEST), REPO / "_temp" / "contact_sheet.jpg")
    if a.tiles_sheet:
        tiles_sheet(REPO / "_temp" / "tiles_sheet.jpg")

    total = sum(p.stat().st_size for p in ASSETS.rglob("*") if p.is_file())
    print(f"assets/projects total {total / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
    sys.exit(main())
