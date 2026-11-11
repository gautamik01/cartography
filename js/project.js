/* project.js : behaviour for the project page template (markup comes from pages.js).
 *
 * Opener: the hero video fades in over its poster the moment it plays; the
 * number, title, kicker and meta hold for TEXT_HOLD_S after the page is
 * entered, then fade, leaving the moving video and a ( SCROLL ) cue.
 */

export const PROJECT = {
  TEXT_HOLD_S: 2.5,       // title, kicker and meta stay this long
  TEXT_FADE_S: 0.8,
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

  return function cleanup() { cleanups.forEach((fn) => fn()); };
}
