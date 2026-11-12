# Project: cartography (portfolio for Apple Maps, Cartographic Designer)

## Audience and goal
Apple design reviewers and recruiters, about 90 seconds on the site. It has to show a cartographic designer with craft in colour, type and graphic systems across scales, with 3D environments, prototypes built with real data and code, and tools and agentic workflows. Featured projects only. No archive.

## How this repo relates to my other repos (important)
- This repo is a showcase. Each project's interactive portal stays where it already lives and is embedded or linked live. Never copy whole repos in here.
- You may READ my other repos freely: raw.githubusercontent.com links, or a shallow clone into a temp folder OUTSIDE this repo that you delete afterwards. Never commit, push to or modify any repo except this one.
- Only curated presentation media lives here, in assets/projects/<slug>/.
- If a project needs a site-only variant of something (a restyled map, say), copy ONLY that file into portals/<slug>/, edit it there, and record its origin in projects.json under "source". The original is never touched.
- references/ is git-ignored and never published.

## Stack (no build step)
- Plain HTML, CSS and vanilla JS (ES modules). Has to run from `python -m http.server` and on GitHub Pages as-is.
- GSAP 3.13 (core, ScrollTrigger, Flip, SplitText) and Lenis, from jsDelivr, pinned to exact versions.
- All content comes from data/projects.json. One template, project.html?p=<slug>, renders any project. Projects with "published": false are hidden everywhere, and the counters adjust.
- Media: tools/prepare_media.py (Pillow + imageio-ffmpeg, so there's no separate ffmpeg install). Images: WebP, max 2400px long edge, quality 82. Videos: H.264 MP4, sharpness first and size second: full-screen openers 1920px wide (never upscaled) at CRF 22, clips beside text or in galleries 1600px max at CRF 23, a 720px `-720.mp4` copy of each at CRF 24; all -preset slow, no audio, faststart, a keyframe every 2s, the last 0.3s crossfaded into the start so the loop has no jump, and a WebP poster that is the encoded file's exact first frame. Before a re-encode replaces a clip, compare one frame old against new at 100%: labels and thin lines must stay as sharp, else lower that clip's CRF by 2 (`crf=` in the manifest). Re-runnable; `--videos` rebuilds only clips.

## Visual reference
Study every PNG in references/. They're frames from a site I love (Our Revolution). Match its structure, spacing, type contrast and motion. Don't copy its content or wordmark, and add my cartographic signature moves below so the site is clearly mine.

## Design tokens
- --paper: #E7E4E0 (home hero, light pages)
- --ink: #0B0B0B (featured section, project pages)
- --sage: #B3B7AD (menu overlay)
- --white: #F5F4F1
- --muted: rgba(11,11,11,0.55) on light, rgba(245,244,241,0.6) on dark
- No other UI colours. Colour only comes from the work.
- 24px gutter on desktop, 16px on mobile. 12-column grid. Generous whitespace.

## Typography
- Adobe Fonts kit vwk1ddw: `<link rel="stylesheet" href="https://use.typekit.net/vwk1ddw.css">` in every page head. What its CSS served on 2026-11-05: kepler-3-display-cond 400; termina 800 and 900; obviously 800; neue-haas-grotesk-text 500; neue-haas-grotesk-display 500.
- --font-display: "kepler-3-display-cond" 400 (Kepler 3 Display Condensed), fallback Instrument Serif. Condensed high-contrast serif, UPPERCASE headlines, line-height 0.88, tracking -0.01em, clamp(56px, 9vw, 160px).
- --font-punch: "termina" 900 (Termina Black), fallback Archivo wdth 125 wght 900. Heavy wide sans for exactly ONE word per headline. Obviously 800 is the other heavy face in the kit; fonts-test.html shows both.
- --font-text: "neue-haas-grotesk-text" 400 and 500, fallback Inter. Grotesk for body (17px, line-height 1.5) and labels. The kit is missing the 400 (Neue Haas Grotesk Text 55 Roman): add it to kit vwk1ddw in Adobe Fonts; until then 400 renders as 500.
- Labels: 11px, uppercase, letter-spacing 0.08em, always in parentheses with spaces: ( MENU ), ( OPEN ), ( CV ↓ ).
- Fallbacks: Instrument Serif, Archivo (wdth 125, weight 900) and Inter, from Google Fonts.
- Copy rule: no em dashes anywhere in site text.

## Global chrome
- No menu overlay. Fixed header with mix-blend-mode: difference so the labels read on paper, ink and images. The wordmark "Gautami Kasat" centred in the display serif, title case, linking home. The four labels "( WORK )" "( ABOUT )" "( CONTACT )" "( CV ↓ )" together in the top-right corner, evenly spaced; CV downloads assets/cv/Gautami_Kasat_CV.pdf. The current page's label carries a small filled dot before it. Under 700px: wordmark on the first row, the four labels evenly spaced on a second row.
- Contact footer at the bottom of every page (home below the hero, work below the strip, about, contact, every project). Left: "( GET IN TOUCH )" then the email large in the display serif (clamp to about 48px), a mailto link that also copies and shows "( COPIED )". Right, stacked: ( LINKEDIN ↗ ) ( GITHUB ↗ ) ( DOWNLOAD CV ↓ ). Bottom row, tiny labels: "© 2026 Gautami Kasat", "( 39.95° N, 75.16° W ) Philadelphia", "( BACK TO TOP ↑ )" at the right. The footer takes the page's colour (--ink on dark pages, --paper on light) with a hairline rule above. The scale bar hides while the footer is in view. LinkedIn: https://www.linkedin.com/in/gautamikasat.

## Motion
- Page transitions: an --ink panel wipes up from the bottom (700ms, power4.inOut), the page navigates, then the panel wipes away upward. Faint procedural contour lines (6% opacity) drift across the panel.
- Headlines: SplitText lines rise out of masks (yPercent 100 to 0, 900ms, stagger 0.08).
- Signature 1: a scale bar fixed bottom-left ("0", bar, "1 km") whose fill tracks scroll progress.
- Signature 2: project meta shows real site coordinates, like ( 39.95° N, 75.16° W ).
- Signature 3: the contour-line wipe.
- Videos: muted, loop, playsinline, poster first. preload none until a clip is within one screen of the viewport (then auto), play only while in view, never more than two at once (`VIDEO` in app.js); the opener alone preloads and autoplays from the first paint. Screens under 700px load the `-720.mp4` copies (js/media.js).
- prefers-reduced-motion: no wipes, ripple, smooth scroll or autoplay. Fades and posters instead.

## Shell contract (css/tokens.css, css/base.css, js/app.js, js/contours.js, js/pages.js, js/hero.js)
- Pages: index.html (home, the hero project browser), work.html (the featured strip), project.html?p=slug[&h=image], about.html, contact.html. Every page: `<html data-theme="paper|ink" data-page="home|work|about|contact">`, the inline `document.documentElement.classList.add('js')`, the Typekit and Google Fonts links, tokens.css then base.css, `<main id="main" data-theme data-page>` carrying the same two attributes (each main paints its own background), then the pinned GSAP 3.13.0 and Lenis scripts and `js/app.js` as a module.
- app.js injects the header, the contact footer (appended to each `<main>` so it rolls with the page; `SITE` at the top of app.js holds the email and links), scale bar and cursor. Internal links do not reload: app.js fetches the next page, injects its `<main>` beside the current one, rolls it up (new page y 100vh to 0, old page up 30vh, scale 0.96, brightness 0.5, 900ms power4.inOut, faint contours along the incoming top edge), then pushState. Back and forward roll in reverse; a failed fetch falls back to a normal navigation; reduced motion crossfades in 200ms. Tuning constants: `ROLL` at the top of app.js.
- pages.js renders `#browser` (home thumbnails and panel, via hero.js), `#work` (the tile strip from data/work.json, via work.js) and `#project` from data/projects.json for the first load and for every rolled-in page; a renderer may return a cleanup function. The router marks a main `data-entered="1"` and dispatches `page:enter` on it once it is fully on screen (first load, or after its roll); the work view starts its enter sequence on that. Tuning constants: `WORK` at the top of js/work.js. A project may carry `lead_video` (with `lead` as its poster): the clip loops muted beside the text in place of the lead image, with the same black-and-white to colour hover and `lead_fit` contain. With `?h=assets/...` the project opener uses that image as its hero; the hero browser passes the hero poster this way and Flips it into the opener. The home panel shows each project's real hero media: its opener video (buffering from the moment the thumbnail is hovered) or its poster. On commit or click the panel passes its playback time as `&t=`, the opener video resumes there (preload auto, poster = the exact first frame), and when the panel is playing a video that same element is adopted as the opener's video during the Flip. `"opener_fit": "contain"` shows non-16:9 opener media whole on ink.
- Hero browser tuning: `BROWSER` at the top of js/hero.js (20vw start, slide and swap timings, lerp, close delay).
- Hooks: `data-split` on a headline (SplitText line reveal), `data-cursor="open"` on anything the cursor should grow over, `data-autoplay` on videos (play only in view), `data-no-transition` on a link to skip the roll.
- `html.fonts-adobe` or `html.fonts-fallback` is set once the kit is checked; the fallback serif is not condensed, so the display size scales by 0.9 under `fonts-fallback`.
- fonts-test.html is a standalone specimen page, not part of the site.

## Project page rules (every project, from now on)
- Never crop UI, dashboards, text, map labels or legends. Gallery images are never cropped (natural aspect ratio, object-fit contain). Lead images only crop empty margins, with a focal point (`lead_focus`) that keeps the subject whole.
- Opener to text panel is a fast triggered snap (about 600ms, power3.inOut) in both directions, never a slow scroll-scrubbed rise.
- The text panel fits one screen at 1440x900. The lead image matches the text column's height.
- Gallery: a strict grid of full-width rows (`"width": "full"`), equal 6/6 pairs whose images share an aspect ratio, or a row of four (`"width": "quarter"`), top-aligned. Nothing staggered or offset. Media never grows past its own pixels, so a small image sits centred in its cell.
- Every gallery caption starts exactly at its own image's left edge and is no wider than the image, site-wide, including images that are centred or narrower than their cell.
- Fixed UI (scale bar, header, labels) never overlaps text or media labels on any page or screen size. The scale bar hides on the home hero and while a caption passes under it.
- Opener media that is not 16:9 (a portrait clip, a 2:1 recording, a poster) is shown whole with `"opener_fit": "contain"` on ink, never cover-cropped.
- Before finishing any project page, look at every image placement yourself and confirm nothing important is cut off.

## Quality bar
Lighthouse performance 90+ on desktop. Lazy-load below the fold. Works fully on a phone. Meaningful alt text. Visible focus. No console errors.

## Projects (this order)
01 raasta: Raasta. "The most scenic walk in Philadelphia, not the fastest one." Walking-route prototype with 3D Mapbox navigation and a Python route engine. Portal: https://raasta-prototype.vercel.app/
02 ski-terrain: Learning to Ski from NYC and Philly. Interactive terrain map of every ski area within three hours of either city, ranked by beginner terrain. Portal: https://gautamik01.github.io/30-day-map-challenge-2026/output/day21_openstreetmap-ski.html. Its opener and lead clips are Gautami's own captures in `../Some Material/Ski/` (read only); the stills and work tiles were recorded from the live page (Playwright, tools/record_ski.py) into ../_temp_sources/ski/. tools/prepare_media.py compresses both.
03 forested-university: Forested University. 3D forested campus: aerial, exploded housing axonometric, human-scale walkthrough animations. No portal: this site is its home.
04 cloud-footprint: The Cloud Has a Footprint. Interactive Mapbox maps of US data centers and AI campuses against water stress, built in Python. Portals: https://gautamik01.github.io/30-day-map-challenge-2026/output/day01_points-ai.html and https://gautamik01.github.io/30-day-map-challenge-2026/output/day03_polygons-water-ai.html
05 map-series: 30 Day Map Challenge, static cartography built from one shared Python toolkit (mapkit). Portal: https://gautamik01.github.io/30-day-map-challenge-2026/output/
