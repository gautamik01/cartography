/* media.js : which encode of a clip a page loads.
 * Every clip exists twice: <name>.mp4 (1600 px wide at most) and <name>-720.mp4 (720 px). Screens under 700 px
 * load the 720 one. Decided once per page load; a resize does not re-request clips already on the page. */
export const NARROW = matchMedia("(max-width: 699px)").matches;
export const videoSrc = (src) => (NARROW && /\.mp4$/i.test(src) ? src.replace(/\.mp4$/i, "-720.mp4") : src);
