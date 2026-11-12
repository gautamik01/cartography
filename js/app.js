/* app.js : the shared shell.
 *
 * Injects the header, the contact footer, scale bar and cursor into every
 * page, renders page content from data/projects.json through pages.js, then
 * wires Lenis smooth scroll, headline reveals, in-view video autoplay and the
 * page roll: internal links fetch the next page, slide its <main> up over the
 * current one and pushState the URL. GSAP (core, ScrollTrigger, Flip,
 * SplitText) and Lenis are loaded as deferred scripts before this module; if a
 * CDN is blocked everything still renders, just without motion.
 */
import { createContours } from "./contours.js";
import { renderPage } from "./pages.js";
import { ICONS, placeIcons } from "./icons.js";

const html = document.documentElement;
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const FINE_POINTER = matchMedia("(hover: hover) and (pointer: fine)").matches;
const HAS_GSAP = typeof window.gsap !== "undefined";
const MOTION = HAS_GSAP && !REDUCED;

// the page roll
export const ROLL = {
  DURATION: 0.9,         // seconds, one continuous motion
  EASE: "power4.inOut",
  OLD_SHIFT: -0.3,       // the leaving page moves up by this fraction of the viewport
  OLD_SCALE: 0.96,
  OLD_BRIGHTNESS: 0.5,
  EDGE_HEIGHT: 180,      // px of contour lines along the incoming page's top edge
  EDGE_ALPHA: 0.08,
  CROSSFADE: 0.2,        // seconds, reduced motion
  SAFETY_MS: 1500,       // a transition that has not finished by then is abandoned for a plain navigation
};

const SITE = {
  name: "Gautami Kasat",
  email: "gautamik@upenn.edu",     // the one place the address lives: footer and contact page
  cv: "assets/cv/Gautami_Kasat_CV.pdf",
  github: "https://github.com/gautamik01",
  linkedin: "https://www.linkedin.com/in/gautamikasat",
  coords: "( 39.95° N, 75.16° W )",
  city: "Philadelphia",
  year: "2026",
  // the four labels sit together top right; the wordmark is centred on its own
  nav: [
    { label: "( WORK )", href: "work.html", page: "work" },
    { label: "( ABOUT )", href: "about.html", page: "about" },
    { label: "( CONTACT )", href: "contact.html", page: "contact" },
    { label: "( CV &#8595; )", href: "assets/cv/Gautami_Kasat_CV.pdf", download: true },
  ],
};

if (REDUCED) html.classList.add("reduced");
if (HAS_GSAP) gsap.registerPlugin(ScrollTrigger, Flip, SplitText);
if ("scrollRestoration" in history) history.scrollRestoration = "manual";

// ---------------------------------------------------------------- helpers
const el = (markup) => {
  const t = document.createElement("template");
  t.innerHTML = markup.trim();
  return t.content.firstElementChild;
};
const pageOf = (main) => main.dataset.page || html.dataset.page || "work";
const themeOf = (main) => main.dataset.theme || html.dataset.theme || "paper";
const navLink = (n) => `<a class="label" href="${n.href}"${n.page ? ` data-nav="${n.page}"` : ""}${n.download ? " download" : ""}>${n.label}</a>`;

// ---------------------------------------------------------------- shell markup
function injectShell() {
  const header = el(`
    <header class="site-header">
      <a class="wordmark" href="index.html" aria-label="${SITE.name}, home">${SITE.name}</a>
      <nav class="site-header__links" aria-label="Site">${SITE.nav.map(navLink).join("")}</nav>
    </header>`);
  const bar = el(`
    <div class="scalebar label" aria-hidden="true">
      <div class="scalebar__track"><div class="scalebar__fill"></div></div>
      <div class="scalebar__labels"><span>0</span><span>1 km</span></div>
    </div>`);
  const cursor = el(`<div class="cursor" aria-hidden="true"><span class="cursor__label">( OPEN )</span></div>`);
  const skip = el(`<a class="skip" href="#main">Skip to content</a>`);

  document.querySelector(".wipe")?.remove();   // older page markup
  document.body.prepend(skip, header);
  document.body.append(bar, cursor);
  return { header, bar, cursor };
}

function setCurrentNav(page) {
  document.querySelectorAll(".site-header [data-nav]").forEach((a) => {
    if (a.dataset.nav === page) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

// the contact footer, one per page, appended to its <main> so it rolls with the page
function footerMarkup() {
  const ne = `<span class="arrow arrow--ne" aria-hidden="true">&#8599;</span>`;
  const down = `<span class="arrow arrow--down" aria-hidden="true">&#8595;</span>`;
  return `
    <footer class="site-footer">
      <div class="site-footer__top">
        <div class="site-footer__contact">
          <p class="label muted">( GET IN TOUCH )</p>
          <a class="site-footer__email" href="mailto:${SITE.email}" data-copy="${SITE.email}">${SITE.email}</a>
          <span class="label site-footer__copied" aria-live="polite"></span>
        </div>
        <nav class="site-footer__links" aria-label="Elsewhere">
          <a class="label" href="${SITE.linkedin}" target="_blank" rel="noopener">${ICONS.linkedin}( LINKEDIN ${ne} )</a>
          <a class="label" href="${SITE.cv}" download>${ICONS.cv}( CV ${down} )</a>
          <a class="label" href="${SITE.github}" target="_blank" rel="noopener">${ICONS.github}( GITHUB ${ne} )</a>
        </nav>
      </div>
      <div class="site-footer__bottom label muted">
        <span>&copy; ${SITE.year} ${SITE.name}</span>
        <span>${SITE.coords} ${SITE.city}</span>
        <a href="#top" data-top>( BACK TO TOP &#8593; )</a>
      </div>
    </footer>`;
}

// the scale bar steps aside while a caption or note would pass under it (bottom-left band of the viewport)
const CLASH = { BAND: 72, RIGHT: 176 };   // px: the band above the bottom edge, and how far right the bar reaches
let clashObserver = null;
let clashTargets = [];
function buildClashObserver() {
  clashObserver?.disconnect();
  clashObserver = new IntersectionObserver((entries) => {
    entries.forEach((e) => { e.target._clash = e.isIntersecting && e.boundingClientRect.left < CLASH.RIGHT; });
    html.classList.toggle("scalebar-clash", clashTargets.some((t) => t._clash));
  }, { rootMargin: `${-(window.innerHeight - CLASH.BAND)}px 0px 0px 0px`, threshold: 0 });
  clashTargets.forEach((t) => clashObserver.observe(t));
}
function watchClashes(main) {
  clashTargets.forEach((t) => { t._clash = false; });
  clashTargets = [...main.querySelectorAll("figcaption, .hero__note, .system__note")];
  html.classList.remove("scalebar-clash");
  buildClashObserver();
}
let clashResize = 0;
window.addEventListener("resize", () => { clearTimeout(clashResize); clashResize = setTimeout(buildClashObserver, 150); }, { passive: true });

let footerObserver = null;
function mountFooter(main) {
  let footer = main.querySelector(".site-footer");
  if (!footer) {
    footer = el(footerMarkup());
    main.append(footer);
  }
  // the contact page shows the address too; it reads SITE.email rather than carrying its own copy
  main.querySelectorAll("[data-site-email]").forEach((n) => { n.textContent = SITE.email; });
  main.querySelectorAll("[data-site-email-link]").forEach((a) => { a.href = `mailto:${SITE.email}`; });
  placeIcons(main);   // the contact page's link marks (static markup carries data-icon placeholders)
  return footer;
}
function watchFooter(footer) {
  footerObserver?.disconnect();
  footerObserver = new IntersectionObserver((entries) => {
    html.classList.toggle("footer-in-view", entries.some((e) => e.isIntersecting));
  }, { threshold: 0 });
  footerObserver.observe(footer);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:-100px;opacity:0";
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

// ---------------------------------------------------------------- fonts
// Typekit first, Google fallbacks after. Mark the html so CSS can size the fallback serif.
async function checkFonts() {
  const link = document.querySelector('link[rel="stylesheet"][href*="use.typekit.net"]');
  const sheetReady = new Promise((resolve) => {
    if (!link) return resolve(false);
    if (link.sheet) return resolve(true);
    link.addEventListener("load", () => resolve(true), { once: true });
    link.addEventListener("error", () => resolve(false), { once: true });
    setTimeout(() => resolve(Boolean(link.sheet)), 3000);
  });
  const ok = await sheetReady;
  if (!ok || !document.fonts) {
    html.classList.add("fonts-fallback");
    return false;
  }
  let loaded = false;
  try {
    const faces = await Promise.race([
      Promise.all(['400 1em "kepler-3-display-cond"', '900 1em "termina"', '500 1em "neue-haas-grotesk-text"']
        .map((f) => document.fonts.load(f))),
      new Promise((resolve) => setTimeout(() => resolve(null), 8000)),
    ]);
    loaded = Boolean(faces) && faces.every((list) => list.length > 0);
  } catch { loaded = false; }
  html.classList.add(loaded ? "fonts-adobe" : "fonts-fallback");
  return loaded;
}

// ---------------------------------------------------------------- scroll + scale bar
function initScroll() {
  let lenis = null;
  if (MOTION && window.Lenis) {
    lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  const fill = document.querySelector(".scalebar__fill");
  const update = () => {
    const max = html.scrollHeight - window.innerHeight;
    const p = max > 2 ? Math.min(1, Math.max(0, window.scrollY / max)) : 1;
    fill.style.transform = `scaleX(${p.toFixed(4)})`;
  };
  const toTop = (smooth = false) => {
    if (lenis) lenis.scrollTo(0, smooth ? { duration: 1.1 } : { immediate: true, force: true });
    else window.scrollTo({ top: 0, behavior: smooth && !REDUCED ? "smooth" : "auto" });
    if (!smooth) window.scrollTo(0, 0);
  };
  if (lenis) lenis.on("scroll", update);
  window.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update, { passive: true });
  update();
  return { lenis, update, toTop };
}

// ---------------------------------------------------------------- headline reveal
function revealHeadlines(scope = document) {
  const heads = scope.querySelectorAll("[data-split]");
  if (!MOTION) { heads.forEach((h) => (h.style.visibility = "visible")); return; }
  heads.forEach((h) => {
    if (h.dataset.splitDone) return;
    h.dataset.splitDone = "1";
    SplitText.create(h, {
      type: "lines",
      mask: "lines",
      linesClass: "line",
      autoSplit: true,
      onSplit(self) {
        gsap.set(h, { visibility: "visible" });
        return gsap.from(self.lines, { yPercent: 100, duration: 0.9, ease: "power4.out", stagger: 0.08 });
      },
    });
  });
}

// ---------------------------------------------------------------- cursor
function initCursor({ cursor }) {
  if (!FINE_POINTER || !HAS_GSAP) return;
  html.classList.add("has-cursor");
  const label = cursor.querySelector(".cursor__label");
  const xTo = gsap.quickTo(cursor, "x", { duration: 0.16, ease: "power3" });
  const yTo = gsap.quickTo(cursor, "y", { duration: 0.16, ease: "power3" });
  let shown = false;
  const show = () => { if (!shown) { shown = true; gsap.to(cursor, { opacity: 1, duration: 0.2 }); } };
  const hide = () => { shown = false; gsap.to(cursor, { opacity: 0, duration: 0.2 }); };
  window.addEventListener("mousemove", (e) => { xTo(e.clientX); yTo(e.clientY); show(); }, { passive: true });
  document.addEventListener("mouseleave", hide);
  document.addEventListener("mouseenter", show);

  const grow = (text) => {
    label.textContent = text;
    cursor.classList.add("is-open");
    gsap.to(cursor, { width: 90, height: 90, duration: REDUCED ? 0 : 0.35, ease: "power3.out", overwrite: "auto" });
  };
  const shrink = () => {
    cursor.classList.remove("is-open");
    gsap.to(cursor, { width: 10, height: 10, duration: REDUCED ? 0 : 0.3, ease: "power3.out", overwrite: "auto" });
  };
  document.addEventListener("mouseover", (e) => {
    const t = e.target.closest("[data-cursor]");
    if (t) grow(t.dataset.cursorLabel || `( ${t.dataset.cursor.toUpperCase()} )`);
  });
  document.addEventListener("mouseout", (e) => {
    const t = e.target.closest("[data-cursor]");
    if (t && !t.contains(e.relatedTarget)) shrink();
  });
}

// ---------------------------------------------------------------- video
// Every clip is muted, looping and inline. It starts with preload none, is raised to auto (and starts loading)
// once it is within one screen of the viewport, plays only while at least PLAY_AT of it is in view, pauses when it
// leaves, and never more than MAX_PLAYING play at once (the most visible win). MAX_PLAYING has to cover a whole row of
// four gallery clips with the lead clip still in view above them (Forested University), else the last clips of the row
// sit on their posters for good: the cap sorts by visible ratio and a full row ties, so DOM order decided. The opener
// carries data-eager: it preloads and autoplays from the first paint, and project.js pauses it once the text panel has
// covered it.
export const VIDEO = {
  MAX_PLAYING: 6,
  PLAY_AT: 0.25,
  PRELOAD_MARGIN: "100% 0px",   // one screen above and below
};
let videoCleanup = null;
function initVideos(scope = document) {
  videoCleanup?.();
  videoCleanup = null;
  const videos = [...scope.querySelectorAll("video[data-autoplay]")];
  if (!videos.length) return;
  videos.forEach((v) => {
    v.muted = true; v.loop = true; v.playsInline = true; v.setAttribute("playsinline", "");
    if (!v.hasAttribute("data-eager")) v.preload = "none";
  });
  if (REDUCED) { videos.forEach((v) => { v.controls = true; }); return; }

  const near = new IntersectionObserver((entries) => {
    entries.forEach(({ target, isIntersecting }) => {
      if (!isIntersecting || target.preload === "auto") return;
      target.preload = "auto";
      if (target.readyState === 0 && target.paused) target.load();   // re-runs resource selection with the new hint; the poster stays
      near.unobserve(target);
    });
  }, { rootMargin: VIDEO.PRELOAD_MARGIN, threshold: 0 });

  const ratio = new Map();
  const settle = () => {
    const want = [...ratio.entries()].filter(([v, r]) => r >= VIDEO.PLAY_AT && !v.dataset.covered)
      .sort((a, b) => b[1] - a[1]).slice(0, VIDEO.MAX_PLAYING).map(([v]) => v);
    ratio.forEach((r, v) => {
      if (want.includes(v)) { if (v.paused) v.play().catch(() => {}); }
      else if (!v.paused) v.pause();
    });
  };
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => ratio.set(e.target, e.isIntersecting ? e.intersectionRatio : 0));
    settle();
  }, { threshold: [0, 0.25, 0.5, 0.75, 1] });
  videos.forEach((v) => { near.observe(v); io.observe(v); v.addEventListener("video:settle", settle); });
  videoCleanup = () => { near.disconnect(); io.disconnect(); videos.forEach((v) => { v.removeEventListener("video:settle", settle); v.pause(); }); };
}

// ---------------------------------------------------------------- the page roll
function isInternalLink(a, e) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  if (a.target && a.target !== "_self") return false;
  if (a.hasAttribute("download") || a.dataset.noTransition !== undefined) return false;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || !/^https?:$/.test(url.protocol)) return false;
  if (url.pathname === location.pathname && url.search === location.search && url.hash) return false;
  return true;
}

async function fetchPage(href) {
  const res = await fetch(href, { headers: { "X-Requested-With": "roll" } });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  const doc = new DOMParser().parseFromString(await res.text(), "text/html");
  const main = doc.querySelector("main");
  if (!main) throw new Error("no main");
  return {
    main: document.adoptNode(main),
    title: doc.title,
    theme: main.dataset.theme || doc.documentElement.dataset.theme || "paper",
    page: main.dataset.page || doc.documentElement.dataset.page || "work",
  };
}

// faint contour lines along the top edge of the incoming page
function addEdge(main, theme) {
  if (!MOTION) return null;
  const canvas = document.createElement("canvas");
  canvas.className = "roll__edge";
  canvas.setAttribute("aria-hidden", "true");
  main.prepend(canvas);
  try {
    createContours(canvas, { alpha: ROLL.EDGE_ALPHA, cell: 8, colour: theme === "ink" ? "245, 244, 241" : "11, 11, 11" }).still();
  } catch { /* the roll works without it */ }
  return canvas;
}

function createRouter(shell, scroll) {
  let current = document.querySelector("main");
  let cleanup = null;
  let busy = false;

  const ctxFor = (main, href) => ({ main, url: new URL(href, location.href), navigate: go });

  // a page is "entered" once it is fully on screen: first load, or after its roll
  function markEntered(main) {
    main.dataset.entered = "1";
    main.dispatchEvent(new CustomEvent("page:enter"));
  }

  async function activate(main, href) {
    watchFooter(mountFooter(main));
    cleanup = (await renderPage(pageOf(main), ctxFor(main, href))) || null;
    watchClashes(main);
    initVideos(main);
    scroll.update();
    if (HAS_GSAP) ScrollTrigger.refresh();
    markEntered(main);
  }

  async function roll(old, incoming, direction) {
    const vh = window.innerHeight;
    const sy = window.scrollY;
    html.classList.add("is-rolling");
    gsap.set(old, { y: -sy, transformOrigin: `50% ${sy}px`, zIndex: 2 });
    scroll.toTop();
    gsap.set(incoming, { zIndex: direction > 0 ? 3 : 1 });
    const tl = gsap.timeline({ defaults: { duration: ROLL.DURATION, ease: ROLL.EASE } });
    if (direction > 0) {
      tl.fromTo(incoming, { y: vh }, { y: 0 }, 0)
        .to(old, { y: -sy + ROLL.OLD_SHIFT * vh, scale: ROLL.OLD_SCALE, filter: `brightness(${ROLL.OLD_BRIGHTNESS})` }, 0);
    } else {
      tl.fromTo(incoming, { y: ROLL.OLD_SHIFT * vh, scale: ROLL.OLD_SCALE, filter: `brightness(${ROLL.OLD_BRIGHTNESS})`, transformOrigin: "50% 0%" },
        { y: 0, scale: 1, filter: "brightness(1)" }, 0)
        .to(old, { y: -sy + vh }, 0);
    }
    tl.add(() => revealHeadlines(incoming), ROLL.DURATION * 0.55);
    await tl.then();
    html.classList.remove("is-rolling");
  }

  // the browser panel's media becomes the project opener: an image Flips into the opener image; a playing hero
  // video is adopted by the opener as its own video, so nothing reloads, seeks or jumps
  async function flipInto(old, incoming, flipFrom) {
    const target = incoming.querySelector(".opener__img");
    if (!target || !flipFrom || !flipFrom.isConnected) {
      // nothing to flip into (a carousel opener, say): the work view's full-screen clone must not stay on top
      if (flipFrom?.classList.contains("work__morph")) {
        gsap.to(flipFrom, { autoAlpha: 0, duration: ROLL.DURATION * 0.6, ease: "power2.inOut", onComplete: () => flipFrom.remove() });
      }
      return roll(old, incoming, 1);
    }
    const text = incoming.querySelectorAll(".opener__text, .opener__meta");
    gsap.set(text, { autoAlpha: 0 });
    gsap.set(incoming, { zIndex: 3 });
    scroll.toTop();
    const same = Math.abs(flipFrom.getBoundingClientRect().width - window.innerWidth) < 2;   // already full screen: nothing to move
    const duration = same ? 0.01 : ROLL.DURATION;
    let flip;
    if (flipFrom.tagName === "VIDEO") {
      const state = Flip.getState(flipFrom);
      incoming.querySelector(".opener__video")?.remove();
      flipFrom.className = "opener__video is-live";
      flipFrom.removeAttribute("style");
      flipFrom.setAttribute("aria-hidden", "true");
      target.after(flipFrom);
      flip = Flip.from(state, { targets: flipFrom, duration, ease: ROLL.EASE, absolute: true });
    } else {
      flipFrom.dataset.flipId = "hero";
      target.dataset.flipId = "hero";
      const state = Flip.getState(flipFrom);
      flip = Flip.from(state, { targets: target, duration, ease: ROLL.EASE, absolute: true });
      if (flipFrom.classList.contains("work__morph")) flipFrom.remove();   // the work view's morph clone has done its job
    }
    await flip.then();
    gsap.to(text, { autoAlpha: 1, duration: 0.6, ease: "power2.out" });
    revealHeadlines(incoming);
  }

  async function crossfade(old, incoming) {
    gsap.set(incoming, { zIndex: 3, opacity: 0 });
    scroll.toTop();
    await gsap.to(incoming, { opacity: 1, duration: ROLL.CROSSFADE, ease: "none" }).then();
    revealHeadlines(incoming);
  }

  async function go(href, { direction = 1, push = true, flipFrom = null } = {}) {
    if (busy) return;
    busy = true;
    let next;
    try { next = await fetchPage(href); } catch (err) {
      console.warn("roll: could not fetch the next page, navigating normally", err);
      location.href = href;
      return;
    }
    const old = current;
    const incoming = next.main;
    incoming.classList.add("is-incoming");
    old.after(incoming);
    cleanup?.(); cleanup = null;
    html.dataset.page = next.page;
    html.dataset.theme = next.theme;
    if (next.title) document.title = next.title;
    if (push) history.pushState({ roll: true }, "", href);
    setCurrentNav(next.page);
    const edge = addEdge(incoming, next.theme);
    const footer = mountFooter(incoming);
    const nextCleanup = await renderPage(next.page, ctxFor(incoming, href));

    // the safety net: a transition that stalls (a lost tween, a decode that never ends) gives way to a plain load
    const transition = !MOTION ? crossfade(old, incoming) : flipFrom ? flipInto(old, incoming, flipFrom) : roll(old, incoming, direction);
    let timer = 0;
    const stalled = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("transition stalled")), ROLL.SAFETY_MS); });
    try {
      await Promise.race([transition, stalled]);
    } catch (err) {
      console.warn("roll: transition did not finish, navigating normally", err);
      location.href = href;
      return;
    } finally {
      clearTimeout(timer);
    }

    old.remove();
    incoming.classList.remove("is-incoming");
    if (HAS_GSAP) gsap.set(incoming, { clearProps: "transform,filter,zIndex,opacity" });
    if (edge) gsap.to(edge, { autoAlpha: 0, duration: 0.6, onComplete: () => edge.remove() });
    current = incoming;
    cleanup = nextCleanup || null;
    watchFooter(footer);
    watchClashes(incoming);
    initVideos(incoming);
    scroll.update();
    scroll.lenis?.resize();
    if (HAS_GSAP) ScrollTrigger.refresh();
    busy = false;
    markEntered(incoming);
  }

  document.addEventListener("click", (e) => {
    const top = e.target.closest("[data-top]");
    if (top) { e.preventDefault(); scroll.toTop(true); return; }
    const copy = e.target.closest("[data-copy]");
    if (copy) {
      const note = copy.parentElement.querySelector(".site-footer__copied");
      copyText(copy.dataset.copy || copy.textContent.trim()).then((ok) => {
        if (!note) return;
        note.textContent = ok ? "( COPIED )" : "";
        clearTimeout(note._t);
        note._t = setTimeout(() => { note.textContent = ""; }, 1800);
      });
      // the mailto still opens
    }
    const a = e.target.closest("a[href]");
    if (!a || !isInternalLink(a, e)) return;
    e.preventDefault();
    go(a.href);
  });
  window.addEventListener("popstate", () => go(location.href, { direction: -1, push: false }));

  // first load
  html.dataset.page = pageOf(current);
  html.dataset.theme = themeOf(current);
  setCurrentNav(pageOf(current));
  history.replaceState({ roll: true }, "", location.href);
  activate(current, location.href).then(() => revealHeadlines(current));

  return { go };
}

// ---------------------------------------------------------------- boot
const shell = injectShell();
checkFonts();
const scroll = initScroll();
initCursor(shell);
const router = createRouter(shell, scroll);
window.__shell = { lenis: scroll.lenis, go: router.go, ROLL };
