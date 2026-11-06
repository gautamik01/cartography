/* pages.js : page content from data/projects.json.
 * app.js calls renderPage(page, ctx) for the first load and for every page it rolls in.
 * ctx = { main, url, navigate }. A renderer may return a cleanup function. */
import { initBrowser } from "./hero.js";

const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pad2 = (n) => String(n).padStart(2, "0");
let cache = null;

export async function loadProjects() {
  if (!cache) cache = fetch("data/projects.json").then((r) => r.json()).then((all) => all.filter((p) => p.published));
  return cache;
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

// ---------------------------------------------------------------- work: the featured strip
async function work(ctx) {
  const cards = ctx.main.querySelector("#cards");
  if (!cards) return null;
  const projects = await loadProjects();
  cards.innerHTML = projects.map((p, i) =>
    `<a class="card" href="project.html?p=${esc(p.slug)}" data-cursor="open" aria-label="${esc(p.title)}">` +
      `<div class="card__media">${media(p.card_video || p.card, p.card, p.card_video ? p.title + ", moving image" : "")}</div>` +
      `<div class="card__meta"><span class="card__title">${esc(p.title)}</span><span class="label muted">( ${pad2(i + 1)} )</span></div>` +
    `</a>`).join("");
  return null;
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
  root.innerHTML =
    `<section class="opener">` +
      `<img class="opener__img" src="${esc(hero)}" alt="${esc(p.title)}" decoding="async" fetchpriority="high">` +
      `<div class="opener__text">` +
        `<p class="label">( ${num} )</p>` +
        `<h1 class="display opener__title" data-split>${esc(p.title)}</h1>` +
        `<p class="opener__kicker">${esc(p.kicker)}</p>` +
      `</div>` +
      `<div class="opener__meta label">` +
        `<div>${esc((p.labels || [])[0] || "")}<br>${esc(p.coords || "")}</div>` +
        `<div>${esc(p.title)}<br>${esc(notTodo(p.role) || esc(p.location || ""))}</div>` +
      `</div>` +
    `</section>` +
    `<section class="project__intro">` +
      `<div class="project__meta label">` +
        `<div>${(p.labels || []).map(esc).join("<br>")}</div>` +
        `<div class="muted">${esc(p.location || "")}<br>${esc(p.year || "")}</div>` +
      `</div>` +
      (p.intro || []).map((t) => `<p>${esc(t)}</p>`).join("") +
    `</section>` +
    `<section class="gallery">` + (p.gallery || []).map((g) =>
      `<figure class="gallery__item">${media(g.src, g.poster, g.alt)}${g.caption ? `<figcaption class="label muted">${esc(g.caption)}</figcaption>` : ""}</figure>`).join("") +
    `</section>` +
    (portals.length ? `<section class="portals">${portals.map((x) =>
      `<a class="label" href="${esc(x.url)}" target="_blank" rel="noopener" data-cursor="open">${esc(x.label)}</a>`).join("")}</section>` : "");
  return null;
}

export async function renderPage(page, ctx) {
  if (page === "home") return home(ctx);
  if (ctx.main.querySelector("#cards")) return work(ctx);
  if (ctx.main.querySelector("#project")) return project(ctx);
  return null;
}
