/* carousel.js : the map series opener, a full-screen horizontal strip of whole maps.
 *
 * The track holds every map twice and loops. It drifts on its own at DRIFT_PX_S,
 * a drag (mouse, pen or finger) takes over with inertia, and a horizontal
 * trackpad swipe nudges it. Reduced motion: no drift, drag still works. */

export const CAROUSEL = {
  DRIFT_PX_S: 34,         // auto drift, px per second (leftward)
  DRAG_FRICTION: 0.94,    // inertia decay per frame after a drag
  RESUME_MS: 1800,        // the drift comes back this long after the last drag or swipe
  WHEEL_GAIN: 0.6,
};

const mod = (a, n) => ((a % n) + n) % n;

export function initCarousel(root) {
  const track = root.querySelector(".carousel__track");
  if (!track) return null;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const items = [...track.children];
  const half = items.length / 2;
  let loopW = 0, pos = 0, velocity = 0, dragging = false, lastX = 0, lastT = 0, resumeAt = 0, raf = 0, last = 0;

  function measure() {
    const first = items[0], second = items[half];
    loopW = second ? second.offsetLeft - first.offsetLeft : track.scrollWidth;
  }
  function render() {
    if (!loopW) return;
    track.style.transform = `translate3d(${-mod(pos, loopW)}px, 0, 0)`;
  }
  function tick(now) {
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    if (!dragging) {
      if (Math.abs(velocity) > 0.05) { pos += velocity; velocity *= CAROUSEL.DRAG_FRICTION; }
      else if (!reduced && now >= resumeAt) pos += CAROUSEL.DRIFT_PX_S * dt;
    }
    render();
    raf = requestAnimationFrame(tick);
  }

  const onDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    dragging = true;
    velocity = 0;
    lastX = e.clientX;
    lastT = performance.now();
    root.classList.add("is-dragging");
    root.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dt = Math.max(1, performance.now() - lastT);
    lastX = e.clientX;
    lastT = performance.now();
    pos -= dx;
    velocity = -dx * Math.min(1, 16 / dt);
    render();
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    root.classList.remove("is-dragging");
    resumeAt = performance.now() + CAROUSEL.RESUME_MS;
  };
  const onWheel = (e) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;   // vertical wheel belongs to the page
    e.preventDefault();
    pos += e.deltaX * CAROUSEL.WHEEL_GAIN;
    velocity = e.deltaX * 0.2;
    resumeAt = performance.now() + CAROUSEL.RESUME_MS;
    render();
  };
  const onResize = () => { measure(); render(); };

  root.addEventListener("pointerdown", onDown);
  root.addEventListener("pointermove", onMove);
  root.addEventListener("pointerup", onUp);
  root.addEventListener("pointercancel", onUp);
  root.addEventListener("wheel", onWheel, { passive: false });
  root.addEventListener("dragstart", (e) => e.preventDefault());
  window.addEventListener("resize", onResize, { passive: true });

  const imgs = [...track.querySelectorAll("img")];
  Promise.all(imgs.map((im) => (im.complete ? Promise.resolve() : new Promise((r) => { im.onload = im.onerror = r; })))).then(onResize);
  measure();
  render();
  raf = requestAnimationFrame(tick);

  return function cleanup() {
    cancelAnimationFrame(raf);
    root.removeEventListener("pointerdown", onDown);
    root.removeEventListener("pointermove", onMove);
    root.removeEventListener("pointerup", onUp);
    root.removeEventListener("pointercancel", onUp);
    root.removeEventListener("wheel", onWheel);
    window.removeEventListener("resize", onResize);
  };
}
