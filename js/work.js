/* work.js : the work view.
 *
 * Tiles from data/work.json, every published project's tiles mixed into one
 * strip so no two neighbours come from the same project, on an infinite
 * horizontal loop with equal gaps. Entering: black screen with FEATURED over
 * PROJECTS, the words drop out of their masks, the header fades in, the tiles
 * grow up from their bottom edges one after another, then the pill appears.
 * Hover: the tile becomes a tilted oval (an SVG clipPath whose ellipse is
 * tweened from a circle that covers the whole tile into an ellipse leaning
 * OVAL_TILT degrees clockwise), its project's tiles stay bright, everything
 * else dims, and the project's number, title and labels fade in under the
 * strip. Click: everything but the oval fades to black, the oval straightens
 * and grows into a rectangle at the centre, then fills the screen with its
 * image scaling up, and the project opens with that image as its hero (?h=).
 * Vertical scroll, drag and horizontal trackpad all move the strip, with
 * inertia. Touch devices get a native horizontal swipe with scroll-snap; one
 * tap highlights, a second opens.
 */

export const WORK = {
  TILE_VW: 22,            // tile width (the aspect is 4:5, see base.css)
  GAP_VW: 2,              // between every tile, the same everywhere
  HOLD_S: 0.2,            // the two words sit on black this long
  WORD_OUT_S: 0.5,        // each word drops out of its mask
  WORD_STAGGER_S: 0.1,    // FEATURED follows PROJECTS by this much
  HEADER_IN_S: 0.5,
  TILE_IN_S: 0.5,         // each tile grows up from its bottom edge
  TILE_STAGGER_S: 0.1,
  TILES_START_S: 0.35,
  PILL_IN_S: 0.4,
  OVAL_S: 0.6,            // rectangle to tilted oval on hover (power3.out)
  OVAL_OUT_S: 0.45,       // and back
  OVAL_TILT: 20,          // degrees clockwise from vertical, top leaning right
  OVAL_RX: 0.47,          // the oval's radii as fractions of the tile's width and height
  OVAL_RY: 0.48,
  COVER: 0.72,            // radii (as fractions) at which the ellipse clears a rectangle's corners: 1/sqrt(2), plus a hair
  DIM_S: 0.3,
  DIM_TO: 0.55,
  CLICK_FADE_S: 0.4,      // 0 to 0.4: everything but the oval fades to black
  CLICK_MID_S: 0.4,       // 0.4 to 0.8: the oval straightens into a rectangle at the centre, about MID_VW wide
  CLICK_FILL_S: 0.5,      // 0.8 to 1.3: fills the screen
  MID_VW: 50,
  SCROLL_RATE: 1,         // strip px per scrolled px
  LOOPS: 1,               // how many full loops of vertical scrolling before the footer
  DRAG_FRICTION: 0.94,    // inertia decay per frame after a drag
  DRAG_CLICK_PX: 6,       // a pointer that moved more than this is a drag, not a click
  SHUFFLE_SEED: 7,        // the mix is the same on every visit
};

const pad2 = (n) => String(n).padStart(2, "0");
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const mod = (a, n) => ((a % n) + n) % n;

// a seeded shuffle, retried until no two neighbours share a project (the loop seam included)
export function mix(tiles, seed) {
  const projects = new Set(tiles.map((t) => t.project));
  if (projects.size < 2) return tiles;
  let s = seed >>> 0;
  const rnd = () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const clean = (arr) => arr.every((t, i) => t.project !== arr[(i + 1) % arr.length].project);
  let best = tiles;
  for (let attempt = 0; attempt < 400; attempt++) {
    const arr = [...tiles];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    if (clean(arr)) return arr;
    best = arr;
  }
  return best;
}

export function initWork(main, { projects, tiles, navigate, entered }) {
  const html = document.documentElement;
  const root = main.querySelector("#work");
  if (!root) return null;
  const hasGsap = typeof window.gsap !== "undefined";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const motion = hasGsap && !reduced;
  const touch = !matchMedia("(hover: hover) and (pointer: fine)").matches;
  const header = document.querySelector(".site-header");

  // ---------------------------------------------------------------- markup
  const bySlug = Object.fromEntries(projects.map((p, i) => [p.slug, { p, i }]));
  const mixed = mix(tiles.filter((t) => bySlug[t.project]), WORK.SHUFFLE_SEED);
  const n = mixed.length;
  const copies = touch ? 1 : 2;      // the desktop loop needs the strip twice
  const tileMarkup = (t, k) => {
    const { p } = bySlug[t.project];
    return `
      <a class="tile${motion ? " is-hidden" : ""}" href="project.html?p=${esc(p.slug)}&h=${esc(t.src)}" data-cursor="open"
         data-project="${esc(p.slug)}" data-k="${k}" data-src="${esc(t.src)}" aria-label="${esc(p.title)}, ${esc(t.label || "")}">
        <img src="${esc(t.src)}" alt="${esc(t.alt || "")}" loading="eager" decoding="async">
      </a>`;
  };
  const clipMarkup = (k) => `<clipPath id="oval-${k}" clipPathUnits="userSpaceOnUse"><ellipse cx="0" cy="0" rx="0" ry="0"/></clipPath>`;
  const total = n * copies;
  root.innerHTML = `
    <svg class="work__clips" aria-hidden="true" focusable="false"><defs>${Array.from({ length: total }, (_, k) => clipMarkup(k)).join("")}</defs></svg>
    <div class="work__intro" aria-hidden="true">
      <div class="work__mask"><span class="display work__word">Featured</span></div>
      <div class="work__mask"><span class="punch work__word work__word--punch">Projects</span></div>
    </div>
    <div class="work__stage">
      <div class="work__track">${Array.from({ length: copies }, (_, c) => mixed.map((t, k) => tileMarkup(t, c * n + k)).join("")).join("")}</div>
      <p class="work__caption label" aria-live="polite"></p>
      <button class="work__pill label" type="button">( ALL PROJECTS )</button>
    </div>`;
  root.classList.toggle("is-touch", touch);

  const intro = root.querySelector(".work__intro");
  const words = [...root.querySelectorAll(".work__word")];
  const stage = root.querySelector(".work__stage");
  const track = root.querySelector(".work__track");
  const caption = root.querySelector(".work__caption");
  const pill = root.querySelector(".work__pill");
  const tileEls = [...track.querySelectorAll(".tile")];
  const ellipses = [...root.querySelectorAll(".work__clips ellipse")];
  track.style.gap = `${WORK.GAP_VW}vw`;

  // ---------------------------------------------------------------- the loop (desktop)
  let loopW = 0, sectionTop = 0, gutter = 24, pos = 0, drag = 0, velocity = 0, dragging = false, raf = 0;
  let pointerStart = null, pointerLast = 0, moved = 0;

  function measure() {
    if (touch) return;
    gutter = parseFloat(getComputedStyle(html).getPropertyValue("--gutter")) || 24;
    const first = tileEls[0], second = tileEls[n];
    loopW = second ? second.offsetLeft - first.offsetLeft : track.scrollWidth;
    sectionTop = root.offsetTop + (main.offsetTop || 0);   // layout position: unaffected by the roll's transform
    root.style.height = `${window.innerHeight + loopW * WORK.LOOPS}px`;
    render();
  }

  function render() {
    if (touch || !loopW) return;
    const sy = Math.min(Math.max(window.scrollY - sectionTop, 0), loopW * WORK.LOOPS);
    pos = mod(sy * WORK.SCROLL_RATE + drag, loopW);
    track.style.transform = `translate3d(${gutter - pos}px, -50%, 0)`;
  }

  function inertia() {
    cancelAnimationFrame(raf);
    const step = () => {
      if (dragging) return;
      velocity *= WORK.DRAG_FRICTION;
      if (Math.abs(velocity) < 0.05) { velocity = 0; render(); return; }
      drag += velocity;
      render();
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  const onPointerDown = (e) => {
    if (touch || e.button !== 0) return;
    dragging = true;
    moved = 0;
    velocity = 0;
    pointerStart = e.clientX;
    pointerLast = e.clientX;
    cancelAnimationFrame(raf);
    // no pointer capture: it would retarget the click to the stage and the tile would never open
  };
  const onPointerMove = (e) => {
    if (!dragging) return;
    const dx = e.clientX - pointerLast;
    pointerLast = e.clientX;
    moved += Math.abs(dx);
    drag -= dx;              // the strip follows the pointer
    velocity = -dx;
    render();
  };
  const onPointerUp = () => {
    if (!dragging) return;
    dragging = false;
    if (Math.abs(velocity) > 0.5) inertia();
  };
  const onWheel = (e) => {
    if (touch) return;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {    // horizontal trackpad: move the strip directly
      e.preventDefault();
      drag += e.deltaX;
      velocity = e.deltaX * 0.4;
      render();
      inertia();
    }
  };
  const onScroll = () => render();
  const onResize = () => measure();

  // ---------------------------------------------------------------- the tilted oval: one SVG ellipse per tile
  // Each tile's clip starts as a circle big enough to show the whole rectangle and is tweened into the leaning
  // ellipse; the clip-path is only attached while the oval is on, so the strip stays cheap to move.
  const ovals = new Map();   // tile -> { state, tween }
  const setEllipse = (el, w, h, rxf, ryf, rot) => {
    el.setAttribute("cx", (w / 2).toFixed(2));
    el.setAttribute("cy", (h / 2).toFixed(2));
    el.setAttribute("rx", (rxf * w).toFixed(2));
    el.setAttribute("ry", (ryf * h).toFixed(2));
    el.setAttribute("transform", `rotate(${rot.toFixed(2)} ${(w / 2).toFixed(2)} ${(h / 2).toFixed(2)})`);
  };
  const coverFractions = (w, h) => {
    const r = Math.hypot(w, h) / 2 * 1.02;      // a circle through the corners
    return { rxf: r / w, ryf: r / h };
  };
  function ovalOf(tile) {
    let o = ovals.get(tile);
    if (!o) {
      const k = Number(tile.dataset.k);
      const c = coverFractions(tile.offsetWidth, tile.offsetHeight);
      o = { k, el: ellipses[k], state: { rxf: c.rxf, ryf: c.ryf, rot: 0 }, tween: null };
      ovals.set(tile, o);
    }
    return o;
  }
  function ovalOn(tile) {
    if (!motion) { tile.classList.add("is-oval"); return; }
    const o = ovalOf(tile);
    const w = tile.offsetWidth, h = tile.offsetHeight;
    tile.style.clipPath = `url(#oval-${o.k})`;
    o.tween?.kill();
    setEllipse(o.el, w, h, o.state.rxf, o.state.ryf, o.state.rot);
    o.tween = gsap.to(o.state, {
      rxf: WORK.OVAL_RX, ryf: WORK.OVAL_RY, rot: WORK.OVAL_TILT, duration: WORK.OVAL_S, ease: "power3.out",
      onUpdate: () => setEllipse(o.el, w, h, o.state.rxf, o.state.ryf, o.state.rot),
    });
  }
  function ovalOff(tile) {
    tile.classList.remove("is-oval");
    if (!motion) return;
    const o = ovals.get(tile);
    if (!o) return;
    const w = tile.offsetWidth, h = tile.offsetHeight;
    const c = coverFractions(w, h);
    o.tween?.kill();
    o.tween = gsap.to(o.state, {
      rxf: c.rxf, ryf: c.ryf, rot: 0, duration: WORK.OVAL_OUT_S, ease: "power3.out",
      onUpdate: () => setEllipse(o.el, w, h, o.state.rxf, o.state.ryf, o.state.rot),
      onComplete: () => { tile.style.clipPath = ""; },
    });
  }

  // ---------------------------------------------------------------- hover and highlight
  let hot = null;
  function highlight(tile) {
    if (hot && hot !== tile) ovalOff(hot);
    hot = tile;
    const slug = tile.dataset.project;
    const { p, i } = bySlug[slug];
    tileEls.forEach((t) => t.classList.toggle("is-dim", t.dataset.project !== slug));
    ovalOn(tile);
    caption.textContent = `( ${pad2(i + 1)} )   ${p.title}   ${(p.labels || []).join("  ")}`;
    if (hasGsap) gsap.to(caption, { autoAlpha: 1, duration: 0.3, overwrite: true });
    else caption.style.opacity = "1";
  }
  function unhighlight() {
    if (hot) ovalOff(hot);
    hot = null;
    tileEls.forEach((t) => t.classList.remove("is-dim"));
    if (hasGsap) gsap.to(caption, { autoAlpha: 0, duration: 0.3, overwrite: true });
    else caption.style.opacity = "0";
  }
  const onOver = (e) => { if (touch) return; const t = e.target.closest(".tile"); if (t && t !== hot) highlight(t); };
  const onOut = (e) => { if (touch) return; const t = e.target.closest(".tile"); if (t && !t.contains(e.relatedTarget) && !e.relatedTarget?.closest?.(".tile")) unhighlight(); };

  // ---------------------------------------------------------------- click: the morph into the project
  // The clone starts as the tile's tilted oval, straightens into a rectangle at the centre while it grows, then
  // fills the screen. Its clip is its own ellipse, re-fitted to the clone's size on every frame.
  let opening = false;
  function openTile(tile) {
    if (opening) return;
    opening = true;
    const url = tile.getAttribute("href");
    if (!motion) {
      if (navigate) navigate(url); else location.href = url;
      return;
    }
    const r = tile.getBoundingClientRect();
    const o = ovalOf(tile);
    const clone = document.createElement("div");
    clone.className = "work__morph";
    clone.innerHTML = `
      <svg class="work__clips" aria-hidden="true" focusable="false"><defs><clipPath id="oval-morph" clipPathUnits="userSpaceOnUse"><ellipse cx="0" cy="0" rx="0" ry="0"/></clipPath></defs></svg>
      <img src="${esc(tile.dataset.src)}" alt="">`;
    Object.assign(clone.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, clipPath: "url(#oval-morph)" });
    document.body.append(clone);
    const ell = clone.querySelector("ellipse");
    const shape = { rxf: o.state.rxf, ryf: o.state.ryf, rot: o.state.rot };
    const fit = () => setEllipse(ell, clone.offsetWidth, clone.offsetHeight, shape.rxf, shape.ryf, shape.rot);
    fit();
    tile.style.visibility = "hidden";
    const vw = window.innerWidth, vh = window.innerHeight;
    const midW = (vw * WORK.MID_VW) / 100, midH = Math.min(vh * 0.62, midW * 1.1);
    const others = [track, caption, pill, header].filter(Boolean);
    const tl = gsap.timeline({
      defaults: { ease: "power3.inOut" },
      onUpdate: fit,
      onComplete: () => { if (navigate) navigate(url, { flipFrom: clone }); else location.href = url; },
    });
    tl.to(others, { autoAlpha: 0, duration: WORK.CLICK_FADE_S }, 0)
      .to(clone, { left: (vw - midW) / 2, top: (vh - midH) / 2, width: midW, height: midH, duration: WORK.CLICK_MID_S }, WORK.CLICK_FADE_S)
      .to(shape, { rxf: WORK.COVER, ryf: WORK.COVER, rot: 0, duration: WORK.CLICK_MID_S }, WORK.CLICK_FADE_S)
      .set(clone, { clipPath: "none" }, WORK.CLICK_FADE_S + WORK.CLICK_MID_S)   // a rectangle now: the clip has nothing left to do
      .to(clone, { left: 0, top: 0, width: vw, height: vh, duration: WORK.CLICK_FILL_S }, WORK.CLICK_FADE_S + WORK.CLICK_MID_S);
    timelines.push(tl);
  }
  const onClick = (e) => {
    const tile = e.target.closest(".tile");
    if (!tile) return;
    e.preventDefault();
    if (moved > WORK.DRAG_CLICK_PX) return;                        // that was a drag
    if (touch && hot !== tile) { highlight(tile); return; }        // first tap highlights
    openTile(tile);
  };
  const onPillClick = () => {
    if (touch) { track.scrollTo({ left: 0, behavior: reduced ? "auto" : "smooth" }); return; }
    if (hasGsap) gsap.to({ d: drag }, { d: 0, duration: 0.8, ease: "power3.inOut", onUpdate() { drag = this.targets()[0].d; render(); } });
    else { drag = 0; render(); }
    const lenis = window.__shell?.lenis;
    if (lenis) lenis.scrollTo(sectionTop, { duration: 1 }); else window.scrollTo({ top: sectionTop, behavior: "smooth" });
  };

  // ---------------------------------------------------------------- entering
  const timelines = [];
  function enter() {
    if (!motion) {
      intro.style.display = "none";
      tileEls.forEach((t) => t.classList.remove("is-hidden"));
      return;
    }
    const visible = tileEls.filter((t) => { const b = t.getBoundingClientRect(); return b.right > 0 && b.left < window.innerWidth; });
    const rest = tileEls.filter((t) => !visible.includes(t));
    const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
    tl.to(words[1], { yPercent: 110, duration: WORK.WORD_OUT_S, ease: "power3.in" }, WORK.HOLD_S)
      .to(words[0], { yPercent: 110, duration: WORK.WORD_OUT_S, ease: "power3.in" }, WORK.HOLD_S + WORK.WORD_STAGGER_S)
      .set(intro, { autoAlpha: 0 }, WORK.HOLD_S + WORK.WORD_STAGGER_S + WORK.WORD_OUT_S)
      .fromTo(header, { autoAlpha: 0 }, { autoAlpha: 1, duration: WORK.HEADER_IN_S }, WORK.HOLD_S + 0.25)
      .to(visible, {
        clipPath: "inset(0% 0% 0% 0%)", duration: WORK.TILE_IN_S, stagger: WORK.TILE_STAGGER_S,
        onComplete: () => visible.forEach((t) => { t.classList.remove("is-hidden"); t.style.clipPath = ""; }),
      }, WORK.TILES_START_S)
      .set(rest, { clipPath: "inset(0% 0% 0% 0%)", onComplete: () => rest.forEach((t) => { t.classList.remove("is-hidden"); t.style.clipPath = ""; }) }, WORK.TILES_START_S + 0.2)
      .fromTo(pill, { autoAlpha: 0 }, { autoAlpha: 1, duration: WORK.PILL_IN_S }, WORK.TILES_START_S + WORK.TILE_IN_S + 0.1);
    timelines.push(tl);
  }

  // ---------------------------------------------------------------- wire up
  if (motion && header) gsap.set(header, { autoAlpha: 0 });     // the enter sequence fades it in
  if (hasGsap) gsap.set([caption, pill], { autoAlpha: 0 });
  measure();
  requestAnimationFrame(measure);                                 // once images and fonts have a layout
  window.addEventListener("resize", onResize, { passive: true });
  window.addEventListener("scroll", onScroll, { passive: true });
  stage.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
  stage.addEventListener("wheel", onWheel, { passive: false });
  track.addEventListener("mouseover", onOver);
  track.addEventListener("mouseout", onOut);
  track.addEventListener("click", onClick);
  pill.addEventListener("click", onPillClick);
  track.addEventListener("dragstart", (e) => e.preventDefault());

  const onEnter = () => { measure(); enter(); };
  if (entered) enter(); else main.addEventListener("page:enter", onEnter, { once: true });

  return function cleanup() {
    cancelAnimationFrame(raf);
    timelines.forEach((t) => t.kill());
    ovals.forEach((o) => o.tween?.kill());
    main.removeEventListener("page:enter", onEnter);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("scroll", onScroll);
    stage.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
    stage.removeEventListener("wheel", onWheel);
    track.removeEventListener("mouseover", onOver);
    track.removeEventListener("mouseout", onOut);
    track.removeEventListener("click", onClick);
    pill.removeEventListener("click", onPillClick);
    // the header comes back with the next page (it was faded by the enter or click sequences)
    if (hasGsap && header) gsap.to(header, { autoAlpha: 1, duration: 0.6, delay: 0.2, overwrite: true });
  };
}
