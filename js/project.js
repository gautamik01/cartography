/* project.js : behaviour for the project page template (markup comes from pages.js).
 *
 * Opener: the hero video fades in over its poster the moment it plays; the
 * number, title, kicker and meta hold for TEXT_HOLD_S after the page is
 * entered, then fade, leaving the moving video and a ( SCROLL ) cue.
 */

import { initCarousel } from "./carousel.js";

export const PROJECT = {
  TEXT_HOLD_S: 2.5,       // title, kicker and meta stay this long
  TEXT_FADE_S: 0.8,
  SNAP_S: 0.6,            // one scroll from the opener snaps to the text panel in this long (power3.inOut), and back
  USE_CLEAR_MS: 160,      // the tool's "use" line lingers this long after the pointer leaves
};

export function initProject(main, { entered } = {}) {
  const hasGsap = typeof window.gsap !== "undefined";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const motion = hasGsap && !reduced;
  const video = main.querySelector(".opener__video");
  const text = main.querySelectorAll(".opener__text, .opener__meta");
  const cleanups = [];

  // ---------------------------------------------------------------- opener video over its poster
  if (video) {
    const live = () => video.classList.add("is-live");
    video.addEventListener("playing", live, { once: true });
    if (!video.paused && !video.ended && video.readyState > 2) live();
    // the sticky opener stays "in view" under the text panel; once the panel covers it, mark it so app.js pauses it
    const panelEl = main.querySelector(".panel-text");
    if (panelEl) {
      let covered = false;
      const check = () => {
        const now = panelEl.getBoundingClientRect().top <= 1;
        if (now === covered) return;
        covered = now;
        if (covered) video.dataset.covered = "1"; else delete video.dataset.covered;
        video.dispatchEvent(new CustomEvent("video:settle"));
      };
      window.addEventListener("scroll", check, { passive: true });
      cleanups.push(() => window.removeEventListener("scroll", check));
    }
    // &t= from the home panel: carry on from where the panel was
    const start = parseFloat(video.dataset.start) || 0;
    if (start > 0) {
      const seek = () => { try { if (Math.abs(video.currentTime - start) > 0.3) video.currentTime = start; } catch { /* not seekable yet */ } };
      if (video.readyState >= 1) seek(); else video.addEventListener("loadedmetadata", seek, { once: true });
    }
    video.play().catch(() => { /* autoplay refused: the poster stays */ });
    cleanups.push(() => { video.removeEventListener("playing", live); video.pause(); });
  }

  // ---------------------------------------------------------------- a carousel opener drifts and drags (js/carousel.js)
  // the drift starts only once the page is fully on screen, so it never competes with the roll
  const carousel = main.querySelector(".carousel");
  if (carousel) {
    const stop = initCarousel(carousel, { started: Boolean(entered) });
    if (stop) {
      cleanups.push(stop);
      if (!entered) {
        const begin = () => stop.start();
        main.addEventListener("page:enter", begin, { once: true });
        cleanups.push(() => main.removeEventListener("page:enter", begin));
      }
    }
  }

  // ---------------------------------------------------------------- the text holds, then fades
  let fadeTween = null;
  const fadeText = () => {
    if (!motion || !text.length) return;
    fadeTween = gsap.to(text, { autoAlpha: 0, duration: PROJECT.TEXT_FADE_S, delay: PROJECT.TEXT_HOLD_S, ease: "power2.inOut" });
  };
  if (entered) fadeText(); else main.addEventListener("page:enter", fadeText, { once: true });
  cleanups.push(() => { main.removeEventListener("page:enter", fadeText); fadeTween?.kill(); });

  // ---------------------------------------------------------------- one scroll or swipe from the opener snaps to the text panel, and back
  // A triggered move, not a scrubbed rise: the first wheel tick or swipe is swallowed and the page travels in SNAP_S.
  const panel = main.querySelector(".panel-text");
  if (motion && panel) {
    const lenis = window.__shell?.lenis;
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);   // power3.inOut
    let snapping = false;
    const panelTop = () => Math.round(panel.getBoundingClientRect().top + window.scrollY);
    const goTo = (y) => {
      snapping = true;
      const done = () => { snapping = false; };
      if (lenis) lenis.scrollTo(y, { duration: PROJECT.SNAP_S, easing: ease, lock: true, force: true, onComplete: done });
      else {
        const o = { y: window.scrollY };
        gsap.to(o, { y, duration: PROJECT.SNAP_S, ease: "power3.inOut", onUpdate: () => window.scrollTo(0, o.y), onComplete: done });
      }
    };
    // returns true when the input was used for a snap (or swallowed mid-snap)
    const decide = (down) => {
      if (snapping) return true;
      const top = panelTop(), y = window.scrollY;
      if (down && y < top - 2) { goTo(top); return true; }
      if (!down && y > 0 && y <= top + 2) { goTo(0); return true; }
      return false;
    };
    const onWheel = (e) => {
      if (Math.abs(e.deltaY) < 2) return;
      if (decide(e.deltaY > 0)) { e.preventDefault(); e.stopImmediatePropagation(); }
    };
    let touchY = null;
    const onTouchStart = (e) => { touchY = e.touches[0].clientY; };
    const onTouchMove = (e) => {
      if (touchY == null) return;
      const dy = touchY - e.touches[0].clientY;
      if (Math.abs(dy) < 12) return;
      touchY = null;
      if (decide(dy > 0)) e.preventDefault();
    };
    window.addEventListener("wheel", onWheel, { capture: true, passive: false });
    window.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    window.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
    cleanups.push(() => {
      window.removeEventListener("wheel", onWheel, { capture: true });
      window.removeEventListener("touchstart", onTouchStart, { capture: true });
      window.removeEventListener("touchmove", onTouchMove, { capture: true });
    });
  }

  // ---------------------------------------------------------------- tools: hover or focus shows what each was used for
  const tools = main.querySelector(".tools");
  if (tools) {
    const use = tools.querySelector(".tools__use");
    let timer = 0;
    const show = (e) => {
      const t = e.target.closest(".tool");
      if (!t) return;
      clearTimeout(timer);
      tools.querySelectorAll(".tool.is-on").forEach((x) => x.classList.remove("is-on"));
      t.classList.add("is-on");
      use.textContent = t.dataset.use || "";
    };
    const hide = (e) => {
      const t = e.target.closest(".tool");
      if (!t) return;
      timer = setTimeout(() => { t.classList.remove("is-on"); use.textContent = ""; }, PROJECT.USE_CLEAR_MS);
    };
    tools.addEventListener("mouseover", show);
    tools.addEventListener("mouseout", hide);
    tools.addEventListener("focusin", show);
    tools.addEventListener("focusout", hide);
    cleanups.push(() => {
      tools.removeEventListener("mouseover", show); tools.removeEventListener("mouseout", hide);
      tools.removeEventListener("focusin", show); tools.removeEventListener("focusout", hide);
      clearTimeout(timer);
    });
  }

  return function cleanup() { cleanups.forEach((fn) => fn()); };
}
