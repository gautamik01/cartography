"""
shoot_portals.py : fresh Playwright captures of the live portals.

Writes PNGs into ../_temp_sources/shots/ (outside the repo), which prepare_media.py
then crops and compresses into assets/projects/<slug>/.

    pip install playwright && playwright install chromium
    python tools/shoot_portals.py            # all portals
    python tools/shoot_portals.py raasta     # one of: day01, raasta

Viewports are CSS pixels; captures are taken at 2x so the crops stay sharp.
"""
import json
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SHOTS = REPO.parent / "_temp_sources" / "shots"

DAY01_URL = "https://gautamik01.github.io/30-day-map-challenge-2026/output/day01_points-ai.html"
RAASTA_URL = "https://raasta-prototype.vercel.app/"

# Software WebGL so Mapbox GL renders in headless Chromium.
CHROMIUM_ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]


def body_text(page):
    try:
        return page.inner_text("body")
    except Exception:
        return ""


def shoot_day01(browser):
    ctx = browser.new_context(viewport={"width": 1600, "height": 1000}, device_scale_factor=2)
    page = ctx.new_page()
    page.goto(DAY01_URL, wait_until="networkidle", timeout=90_000)
    time.sleep(8)  # let the tiles and glow layers settle
    page.screenshot(path=str(SHOTS / "day01_points-ai_1600x1000.png"))
    print("day01: title reads ->", body_text(page).split("\n")[1:3])
    ctx.close()


def pick_first_suggestion(page):
    """Raasta's place fields show a list of <li><button> suggestions; take the first one."""
    time.sleep(2.5)
    first = page.locator("ul li button").first
    first.click(timeout=5_000)


def shoot_raasta(browser, origin="Philadelphia City Hall", destination="Rittenhouse Square", mood="somewhere old"):
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
    page = ctx.new_page()
    page.goto(RAASTA_URL, wait_until="networkidle", timeout=90_000)
    time.sleep(5)

    # The route engine sleeps on its free tier; wait for the health check to clear.
    t0 = time.time()
    while "Waking up" in body_text(page) and time.time() - t0 < 120:
        time.sleep(3)
    page.screenshot(path=str(SHOTS / "raasta_landing_1440x900.png"))
    print("raasta: landing saved")

    page.locator("input.hero__line").fill(mood)
    page.get_by_placeholder("A corner, a landmark, an address").type(origin, delay=40)
    pick_first_suggestion(page)
    page.get_by_placeholder("Where you're headed, or leave it for a loop").type(destination, delay=40)
    pick_first_suggestion(page)
    page.get_by_role("button", name="Find my walk").click()

    t0 = time.time()
    while time.time() - t0 < 150:
        time.sleep(5)
        txt = body_text(page).lower()
        if "start walk" in txt or "preview walk" in txt:
            break
    time.sleep(4)
    page.screenshot(path=str(SHOTS / "raasta_route_1440x900.png"))
    (SHOTS / "raasta_route_text.txt").write_text(body_text(page), encoding="utf-8")
    print("raasta: route saved")

    page.get_by_role("button", name="See it in 3D").click(timeout=5_000)
    time.sleep(10)
    page.screenshot(path=str(SHOTS / "raasta_route_3d_1440x900.png"))
    print("raasta: 3D route saved")
    ctx.close()


def main(which):
    from playwright.sync_api import sync_playwright

    SHOTS.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(args=CHROMIUM_ARGS)
        if "day01" in which:
            shoot_day01(browser)
        if "raasta" in which:
            shoot_raasta(browser)
        browser.close()
    print("shots in", SHOTS)


if __name__ == "__main__":
    main(sys.argv[1:] or ["day01", "raasta"])
