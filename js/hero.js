/* hero.js : the home hero project browser.
 *
 * Under the headline: one thumbnail per published project and a counter.
 * Hovering a thumbnail slides a panel in from the left edge over the headline
 * at START_VW. Moving the pointer left, toward the panel, grows it; the
 * pointer's x between the thumbnails and the panel's resting edge maps onto
 * START_VW to 100vw, smoothed with a lerp. Once the panel reaches COMMIT_VW it
 * commits: it finishes growing to the full viewport on its own and opens the
 * project, handing its image to the project opener through ?h= (the Flip start
 * state). Below COMMIT_VW moving right shrinks it back. Clicking the thumbnail
 * or the panel opens the project too. Touch: first tap opens the panel, second
 * tap opens the project.
 */

export const BROWSER = {
  START_VW: 33.33,       // panel width when it slides in, and the right end of the pointer mapping
  COMMIT_VW: 75,         // at this width the panel commits and opens the project
  COMMIT_MS: 500,        // power3.inOut, the last stretch to 100vw
  SLIDE_IN_MS: 700,      // power3.out
  SLIDE_OUT_MS: 500,     // power3.in
  SWAP_MS: 500,          // next image slides up over the old one
  LERP: 0.12,            // width smoothing per frame (0 = frozen, 1 = instant)
  CLOSE_DELAY_MS: 600,   // pointer away from thumbnails and panel this long: slide out
  FULL_AT: 0.995,        // fraction of the viewport width that counts as fully open (click path)
  FULL_FADE_MS: 400,     // title, kicker and ( OPEN PROJECT ) fade at full width
  ZONE_PAD: 24,          // px of slack around the thumbnails
};

const pad2 = (n) => String(n).padStart(2, "0");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function initBrowser(root, projects, { navigate } = {}) {
  const html = document.documentElement;
  const thumbs = root.querySelector(".browser__thumbs");
  const counter = root.querySelector(".browser__counter");
  const panel = root.querySelector(".panel");
  const media = panel.querySelector(".panel__media");
  const top = panel.querySelector(".panel__top");
  const bottom = panel.querySelector(".panel__bottom");
  const full = panel.querySelector(".panel__full");
  const fullTitle = panel.querySelector(".panel__title");
  const fullKicker = panel.querySelector(".panel__kicker");
  const thumbEls = [...thumbs.querySelectorAll(".thumb")];
  const hasGsap = typeof window.gsap !== "undefined";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // touch: no hover, so taps drive everything. Also learned at runtime from the first touch pointer,
  // because a tap fires compatibility mouseenter/click events that would otherwise read as hover + click.
  let touch = !matchMedia("(hover: hover) and (pointer: fine)").matches;
  const onPointerDown = (e) => { if (e.pointerType === "touch") touch = true; };
  window.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });

  let open = false, committed = false, current = -1, width = 0, targetW = 0, raf = 0, closeTimer = 0, isFull = false;
  let currentImg = null, commitTween = null;
  const vw = () => window.innerWidth;
  const startPx = () => (vw() * BROWSER.START_VW) / 100;
  const commitPx = () => (vw() * BROWSER.COMMIT_VW) / 100;

  function setFull(next) {
    if (next === isFull) return;
    isFull = next;
    panel.classList.toggle("is-full", next);
    if (hasGsap) gsap.to(full, { autoAlpha: next ? 1 : 0, duration: BROWSER.FULL_FADE_MS / 1000, ease: "power2.out", overwrite: true });
    else full.style.opacity = next ? "1" : "0";
  }

  function setWidth(w) {
    width = w;
    panel.style.width = `${w}px`;
  }

  function tick() {
    if (committed) return;
    let w = width + (targetW - width) * (reduced ? 1 : BROWSER.LERP);
    if (Math.abs(targetW - w) < 0.5) w = targetW;
    setWidth(w);
    if (w >= commitPx()) { commit(); return; }
    setFull(w >= vw() * BROWSER.FULL_AT);
    if (open) raf = requestAnimationFrame(tick);
  }

  function slideIn() {
    open = true;
    html.classList.add("panel-open");
    panel.setAttribute("aria-hidden", "false");
    targetW = startPx();
    setWidth(targetW);
    if (hasGsap) {
      // x: 0 matters: GSAP reads the stylesheet's translateX(-100%) as pixels and would keep it under the percent tween
      gsap.killTweensOf(panel);
      gsap.fromTo(panel, { xPercent: -100, x: 0 }, { xPercent: 0, x: 0, duration: reduced ? 0 : BROWSER.SLIDE_IN_MS / 1000, ease: "power3.out" });
    } else {
      panel.style.transform = "none";
    }
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }

  function slideOut() {
    if (committed) return;
    open = false;
    html.classList.remove("panel-open");
    cancelAnimationFrame(raf);
    const done = () => { panel.setAttribute("aria-hidden", "true"); setFull(false); };
    if (hasGsap) gsap.to(panel, { xPercent: -100, x: 0, duration: reduced ? 0 : BROWSER.SLIDE_OUT_MS / 1000, ease: "power3.in", onComplete: done });
    else { panel.style.transform = ""; done(); }
  }

  // the project's real hero: its opener video, buffering the moment the thumbnail is hovered, or its poster
  function heroVideo(p) {
    const v = document.createElement("video");
    v.className = "panel__img";
    v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = true; v.preload = "auto";
    v.setAttribute("muted", ""); v.setAttribute("playsinline", ""); v.setAttribute("aria-hidden", "true");
    v.poster = p.hero;
    v.src = p.hero_video;
    v.play().catch(() => { /* the poster stays until the browser allows it */ });
    return v;
  }
  function heroImage(p) {
    const img = new Image();
    img.className = "panel__img";
    img.alt = "";
    img.decoding = "async";
    img.src = p.hero || p.card;
    return img;
  }

  function swap(i) {
    const p = projects[i];
    current = i;
    const el = p.hero_video && !reduced ? heroVideo(p) : heroImage(p);
    const old = [...media.querySelectorAll(".panel__img")];
    const drop = () => old.forEach((o) => { if (o.tagName === "VIDEO") o.pause(); o.remove(); });
    media.append(el);
    currentImg = el;
    if (hasGsap && old.length && !reduced) {
      gsap.fromTo(el, { yPercent: 100 }, { yPercent: 0, duration: BROWSER.SWAP_MS / 1000, ease: "power3.out", onComplete: drop });
    } else {
      drop();
    }
    top.textContent = `${(p.labels && p.labels[0]) || ""}  ${p.coords || ""}`.trim();
    bottom.textContent = `${p.title}  ${p.role && !/^TODO/i.test(p.role) ? p.role : ""}`.trim();
    fullTitle.textContent = p.title;
    fullKicker.textContent = p.kicker || "";
    counter.textContent = `( ${pad2(i + 1)} / ${pad2(projects.length)} )`;
    thumbEls.forEach((t, k) => t.classList.toggle("is-active", k === i));
  }

  function show(i) {
    if (committed) return;
    cancelClose();
    if (!open) slideIn();
    if (i !== current) swap(i);
  }

  function scheduleClose() {
    if (closeTimer || !open || committed) return;
    closeTimer = setTimeout(() => { closeTimer = 0; slideOut(); }, BROWSER.CLOSE_DELAY_MS);
  }
  function cancelClose() {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = 0; }
  }

  // the opener gets the hero poster as its image and, when the panel is playing the hero video, its playback time
  const projectUrl = (p) => {
    const v = currentImg && currentImg.tagName === "VIDEO" ? currentImg : null;
    const t = v && v.currentTime > 0.05 ? `&t=${v.currentTime.toFixed(2)}` : "";
    return `project.html?p=${encodeURIComponent(p.slug)}&h=${encodeURIComponent(p.hero || p.card)}${t}`;
  };

  function openProject(e, flipFrom) {
    const p = projects[current];
    if (!p) return;
    if (e) e.preventDefault();
    const url = projectUrl(p);
    if (navigate) navigate(url, { flipFrom: flipFrom || currentImg });
    else location.href = url;
  }

  // past COMMIT_VW the pointer no longer matters: finish growing, then open the project
  function commit() {
    committed = true;
    cancelClose();
    cancelAnimationFrame(raf);
    html.classList.add("panel-committed");
    if (!hasGsap || reduced) { setWidth(vw()); openProject(null); return; }
    const state = { w: width };
    commitTween = gsap.to(state, {
      w: vw(), duration: BROWSER.COMMIT_MS / 1000, ease: "power3.inOut",
      onUpdate: () => setWidth(state.w),
      onComplete: () => openProject(null),
    });
  }

  // pointer x drives the width: thumbnails = START_VW, the panel's resting edge = 100vw
  function onMove(e) {
    if (!open || touch || committed) return;
    const t = thumbs.getBoundingClientRect();
    const x = e.clientX, y = e.clientY;
    const overThumbs = x >= t.left - BROWSER.ZONE_PAD && x <= t.right + BROWSER.ZONE_PAD && y >= t.top - BROWSER.ZONE_PAD && y <= t.bottom + BROWSER.ZONE_PAD;
    const x0 = t.left, x1 = startPx();
    if (overThumbs || x >= x0) targetW = startPx();
    else targetW = startPx() + (vw() - startPx()) * clamp((x0 - x) / (x0 - x1), 0, 1);
    // inside: over the thumbnails, over the panel, or in the corridor between them (below the header band)
    const overPanel = x <= width;
    const corridor = x < x0 && y >= window.innerHeight * 0.15;
    const inside = overThumbs || overPanel || corridor;
    inside ? cancelClose() : scheduleClose();
  }
  function onLeaveWindow() { if (open) scheduleClose(); }

  const thumbHandlers = thumbEls.map((t, i) => {
    const enter = () => { if (!touch) show(i); };
    const click = (e) => {
      if (committed) { e.preventDefault(); return; }
      if (touch && (!open || current !== i)) { e.preventDefault(); show(i); return; }   // first tap opens the panel
      if (!open || current !== i) swap(i);
      openProject(e);
    };
    t.addEventListener("mouseenter", enter);
    t.addEventListener("focus", enter);
    t.addEventListener("click", click);
    return { t, enter, click };
  });
  const panelClick = (e) => { if (!committed) openProject(e); };
  panel.addEventListener("click", panelClick);
  window.addEventListener("mousemove", onMove, { passive: true });
  document.addEventListener("mouseleave", onLeaveWindow);
  const onKey = (e) => { if (e.key === "Escape" && open && !committed) slideOut(); };
  document.addEventListener("keydown", onKey);
  const onTouchOutside = (e) => { if (touch && open && !committed && !root.contains(e.target)) slideOut(); };
  document.addEventListener("pointerdown", onTouchOutside);

  return function cleanup() {
    cancelAnimationFrame(raf);
    cancelClose();
    commitTween?.kill();
    html.classList.remove("panel-open", "panel-committed");
    thumbHandlers.forEach(({ t, enter, click }) => { t.removeEventListener("mouseenter", enter); t.removeEventListener("focus", enter); t.removeEventListener("click", click); });
    panel.removeEventListener("click", panelClick);
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("pointerdown", onPointerDown, { capture: true });
    document.removeEventListener("mouseleave", onLeaveWindow);
    document.removeEventListener("keydown", onKey);
    document.removeEventListener("pointerdown", onTouchOutside);
    if (hasGsap) gsap.killTweensOf([panel, full]);
  };
}
