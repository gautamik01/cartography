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
- Media: tools/prepare_media.py (Pillow + imageio-ffmpeg, so there's no separate ffmpeg install). Images: WebP, max 2400px long edge, quality 82. Videos: H.264 MP4, max 1920px wide, CRF 26, -preset veryfast, no audio, faststart, under 15MB, each with a WebP poster. Re-runnable.

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
- Adobe Fonts kit: (added in Prompt 2)
- --font-display: condensed high-contrast serif, UPPERCASE headlines, line-height 0.88, tracking -0.01em, clamp(56px, 9vw, 160px).
- --font-punch: heavy wide sans for exactly ONE word per headline.
- --font-text: grotesk for body (17px, line-height 1.5) and labels.
- Labels: 11px, uppercase, letter-spacing 0.08em, always in parentheses with spaces: ( MENU ), ( OPEN ), ( CV ↓ ).
- Fallbacks: Instrument Serif, Archivo (wdth 125, weight 900) and Inter, from Google Fonts.
- Copy rule: no em dashes anywhere in site text.

## Global chrome
- Fixed header with mix-blend-mode: difference. Left "( MENU )". Centre the wordmark "Gautami Kasat" in the display serif, title case. Right "( CV ↓ )", which downloads assets/cv/Gautami_Kasat_CV.pdf.
- Menu overlay on sage: WORK, ABOUT, CONTACT, huge and centred, with "( YOU ARE HERE )" on both sides of the current page. Footer: ( LINKEDIN ) ( GITHUB ) ( EMAIL ) ( CV ). The header left becomes "( CLOSE )".
- Menu hover: the item switches to the punch font in white with a short liquid ripple (SVG feTurbulence + feDisplacementMap animated with GSAP, about 600ms, then settles).

## Motion
- Page transitions: an --ink panel wipes up from the bottom (700ms, power4.inOut), the page navigates, then the panel wipes away upward. Faint procedural contour lines (6% opacity) drift across the panel.
- Headlines: SplitText lines rise out of masks (yPercent 100 to 0, 900ms, stagger 0.08).
- Signature 1: a scale bar fixed bottom-left ("0", bar, "1 km") whose fill tracks scroll progress.
- Signature 2: project meta shows real site coordinates, like ( 39.95° N, 75.16° W ).
- Signature 3: the contour-line wipe.
- Videos: muted, loop, playsinline, autoplay only while in view, poster first.
- prefers-reduced-motion: no wipes, ripple, smooth scroll or autoplay. Fades and posters instead.

## Quality bar
Lighthouse performance 90+ on desktop. Lazy-load below the fold. Works fully on a phone. Meaningful alt text. Visible focus. No console errors.

## Projects (this order)
01 raasta: Raasta. "The most scenic walk in Philadelphia, not the fastest one." Walking-route prototype with 3D Mapbox navigation and a Python route engine. Portal: https://raasta-prototype.vercel.app/
02 ski-terrain: Learning to Ski from NYC and Philly. Interactive terrain map of beginner ski areas within a day trip. Still being built, so "published": false until I give you the portal URL.
03 forested-university: Forested University. 3D forested campus: aerial, exploded housing axonometric, human-scale walkthrough animations. No portal: this site is its home.
04 cloud-footprint: The Cloud Has a Footprint. Interactive Mapbox maps of US data centers and AI campuses against water stress, built in Python. Portals: https://gautamik01.github.io/30-day-map-challenge-2026/output/day01_points-ai.html and https://gautamik01.github.io/30-day-map-challenge-2026/output/day03_polygons-water-ai.html
05 map-series: 30 Day Map Challenge, static cartography built from one shared Python toolkit (mapkit). Portal: https://gautamik01.github.io/30-day-map-challenge-2026/output/
