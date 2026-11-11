/* pages.js : page content from data/projects.json.
 * app.js calls renderPage(page, ctx) for the first load and for every page it rolls in.
 * ctx = { main, url, navigate }. A renderer may return a cleanup function. */
import { initBrowser } from "./hero.js";
import { initWork } from "./work.js";
import { initProject } from "./project.js";

const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pad2 = (n) => String(n).padStart(2, "0");
let cache = null;
let tileCache = null;

export async function loadProjects() {
  if (!cache) cache = fetch("data/projects.json").then((r) => r.json()).then((all) => all.filter((p) => p.published));
  return cache;
}
export async function loadTiles() {
  if (!tileCache) tileCache = fetch("data/work.json").then((r) => r.json());
  return tileCache;
}

const media = (src, poster, alt, autoplay = true) => /\.mp4$/i.test(src)
  ? `<video ${autoplay ? "data-autoplay " : ""}muted loop playsinline preload="none"${poster ? ` poster="${esc(poster)}"` : ""} aria-label="${esc(alt)}"><source src="${esc(src)}" type="video/mp4"></video>`
  : `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async">`;

// only site assets may be handed in as a hero through ?h=
const safeHero = (h) => (h && /^assets\/[\w\-./]+\.(webp|jpg|jpeg|png)$/i.test(h) ? h : null);
const notTodo = (s) => (s && !/^TODO/i.test(s) ? s : "");

// ---------------------------------------------------------------- home: the project browser
async function home(ctx) {
  const root = ctx.main.querySelector("#browser");
  if (!root) return null;
  const projects = await loadProjects();
  root.querySelector(".browser__thumbs").innerHTML = projects.map((p, i) =>
    `<a class="thumb" href="project.html?p=${esc(p.slug)}&h=${esc(p.card)}" aria-label="${esc(p.title)}">` +
      `<img src="${esc(p.card)}" alt="" loading="eager" decoding="async"></a>`).join("");
  root.querySelector(".browser__counter").textContent = `( 01 / ${pad2(projects.length)} )`;
  return initBrowser(root, projects, { navigate: ctx.navigate });
}

// ---------------------------------------------------------------- work: the tile strip (js/work.js)
async function work(ctx) {
  if (!ctx.main.querySelector("#work")) return null;
  const [projects, tiles] = await Promise.all([loadProjects(), loadTiles()]);
  const published = new Set(projects.map((p) => p.slug));
  return initWork(ctx.main, {
    projects,
    tiles: tiles.filter((t) => published.has(t.project)),   // unpublished projects' tiles stay hidden
    navigate: ctx.navigate,
    entered: ctx.main.dataset.entered === "1",
  });
}

// ---------------------------------------------------------------- project: one template for every project
async function project(ctx) {
  const root = ctx.main.querySelector("#project");
  if (!root) return null;
  const projects = await loadProjects();
  const url = ctx.url || new URL(location.href);
  const slug = url.searchParams.get("p");
  const i = projects.findIndex((x) => x.slug === slug);
  const p = i >= 0 ? projects[i] : (slug ? null : projects[0]);
  if (!p) {
    root.innerHTML = `<p class="empty text">No project at this address. <a href="work.html">( BACK TO WORK )</a></p>`;
    return null;
  }
  document.title = `${p.title}, Gautami Kasat`;
  const hero = safeHero(url.searchParams.get("h")) || p.hero || p.lead;
  const portals = (p.portals || []).filter((x) => x.url && !/^TODO/i.test(x.url));
  const num = pad2(Math.max(i, 0) + 1);
  const tone = p.opener_text === "dark" ? "dark" : "light";
  const place = [p.location, p.year].filter((s) => s && !/^TODO/i.test(s)).join(" · ");
  root.innerHTML =
    // the opener: hero video playing over its poster (or the ?h= image), text that holds then fades, a scroll cue
    `<section class="opener" data-text="${tone}">` +
      `<img class="opener__img" src="${esc(hero)}" alt="${esc(p.title)}" decoding="async" fetchpriority="high">` +
      (p.hero_video ? `<video class="opener__video" muted loop playsinline autoplay preload="auto" poster="${esc(p.hero)}" aria-hidden="true"><source src="${esc(p.hero_video)}" type="video/mp4"></video>` : "") +
      `<div class="opener__text">` +
        `<p class="label">( ${num} )</p>` +
        `<h1 class="display opener__title" data-split>${esc(p.title)}</h1>` +
        `<p class="opener__kicker">${esc(p.kicker)}</p>` +
      `</div>` +
      `<div class="opener__meta label">` +
        `<div>${esc((p.labels || [])[0] || "")}<br>${esc(p.coords || "")}</div>` +
        `<div>${esc(p.title)}<br>${esc(notTodo(p.role) || p.location || "")}</div>` +
      `</div>` +
      `<p class="label opener__cue" aria-hidden="true">( SCROLL )</p>` +
    `</section>` +
    // the text panel: lead image left (sticky, black and white), everything else right
    `<section class="panel-text" id="panel-text">` +
      `<div class="panel-text__grid">` +
        `<figure class="panel-text__lead"><img class="lead-img${p.lead_bw ? " is-bw" : ""}" src="${esc(p.lead)}" alt="${esc(p.title)}" loading="lazy" decoding="async"></figure>` +
        `<div class="panel-text__body">` +
          `<h2 class="display panel-text__title">${esc(p.title)}</h2>` +
          `<p class="label panel-text__labels">${(p.labels || []).map(esc).join("  ")}</p>` +
          (place ? `<p class="label muted">${esc(place)}</p>` : "") +
          portals.map((x) => portalButton(x, p)).join("") +
          `<div class="text panel-text__intro">${(p.intro || []).map((t) => `<p>${esc(t)}</p>`).join("")}</div>` +
        `</div>` +
      `</div>` +
    `</section>` +
    `<section class="gallery">` + (p.gallery || []).map((g) =>
      `<figure class="gallery__item">${media(g.src, g.poster, g.alt)}${g.caption ? `<figcaption class="label muted">${esc(g.caption)}</figcaption>` : ""}</figure>`).join("") +
    `</section>`;
  return initProject(ctx.main, { entered: ctx.main.dataset.entered === "1" });
}

// "there is a live thing you can use": an ink capsule with a small moving window into the portal
function portalButton(x, p) {
  let host = "";
  try { host = new URL(x.url).host; } catch { host = x.url; }
  const label = esc(x.label || "( OPEN ↗ )");
  const open = label.includes("↗")
    ? label.replace("↗", `<span class="portal__arrow" aria-hidden="true">↗</span>`)
    : label.replace(/\s*\)\s*$/, ` <span class="portal__arrow" aria-hidden="true">↗</span> )`);
  const window_ = x.window
    ? `<video data-autoplay muted loop playsinline preload="none" poster="${esc(x.window_poster || "")}" aria-hidden="true"><source src="${esc(x.window)}" type="video/mp4"></video>`
    : `<img src="${esc(x.window_poster || p.card)}" alt="" aria-hidden="true">`;
  const cta = esc(x.cta || "Try the prototype");
  return `
    <a class="portal" href="${esc(x.url)}" target="_blank" rel="noopener" data-cursor="open" aria-label="${cta}: ${esc(p.title)} opens in a new tab">
      <span class="portal__window">${window_}</span>
      <span class="portal__live" aria-hidden="true"><span class="portal__dot"></span>LIVE</span>
      <span class="portal__text">
        <span class="portal__cta">${cta}</span>
        <span class="label portal__open">${open}</span>
        <span class="label portal__url" aria-hidden="true">${esc(host)}</span>
      </span>
    </a>`;
}

export async function renderPage(page, ctx) {
  if (page === "home") return home(ctx);
  if (ctx.main.querySelector("#work")) return work(ctx);
  if (ctx.main.querySelector("#project")) return project(ctx);
  return null;
}
