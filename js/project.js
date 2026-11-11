/* project.js : behaviour for the project page template (markup comes from pages.js).
 *
 * Opener: the hero video fades in over its poster the moment it plays; the
 * number, title, kicker and meta hold for TEXT_HOLD_S after the page is
 * entered, then fade, leaving the moving video and a ( SCROLL ) cue.
 */

export const PROJECT = {
  TEXT_HOLD_S: 2.5,       // title, kicker and meta stay this long
  TEXT_FADE_S: 0.8,
  SNAP_AT: 0.08,          // once the panel has risen this far (0 to 1) a scroll commits to it
  SNAP_MIN_S: 0.3,
  SNAP_MAX_S: 0.7,
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
    video.play().catch(() => { /* autoplay refused: the poster stays */ });
    cleanups.push(() => { video.removeEventListener("playing", live); video.pause(); });
  }

  // ---------------------------------------------------------------- the text holds, then fades
  let fadeTween = null;
  const fadeText = () => {
    if (!motion || !text.length) return;
    fadeTween = gsap.to(text, { autoAlpha: 0, duration: PROJECT.TEXT_FADE_S, delay: PROJECT.TEXT_HOLD_S, ease: "power2.inOut" });
  };
  if (entered) fadeText(); else main.addEventListener("page:enter", fadeText, { once: true });
  cleanups.push(() => { main.removeEventListener("page:enter", fadeText); fadeTween?.kill(); });

  // ---------------------------------------------------------------- scrolling snaps to the text panel and holds there
  const panel = main.querySelector(".panel-text");
  if (motion && window.ScrollTrigger && panel) {
    const st = ScrollTrigger.create({
      trigger: panel,
      start: "top bottom",
      end: "top top",
      snap: {
        snapTo: (value) => (value > PROJECT.SNAP_AT ? 1 : 0),
        duration: { min: PROJECT.SNAP_MIN_S, max: PROJECT.SNAP_MAX_S },
        delay: 0.05,
        ease: "power2.inOut",
      },
    });
    cleanups.push(() => st.kill());
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
