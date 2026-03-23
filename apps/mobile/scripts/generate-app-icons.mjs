/**
 * Rasterizes the wordmark gold “P” into app icons (replaces plain circle).
 * Run from apps/mobile: npm run generate-app-icons
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const assets = join(root, "assets");

const BG = "#1a3c2a";
const GOLD = "#c9a32d";
/** ~1/3 icon width like previous solid circle (glyph bbox ~81×87 in logo units). */
const MARK_SCALE = 4.22;
/** Circle center in logo coordinates (ring around “P”). */
const CX = 41.13;
const CY = 39.68;

function wrapMark({ size, background }) {
  const mark = readFileSync(join(assets, "app-icon-p-mark.svg"), "utf8");
  const inner = mark.replace(/<\?xml[^?]*\?>\s*/i, "").replace(/<!--[\s\S]*?-->\s*/g, "");
  const pathsOnly = inner.replace(/<svg\b[\s\S]*?>/i, "").replace(/<\/svg>\s*$/i, "");
  const bgRect =
    background === "none"
      ? ""
      : `<rect width="${size}" height="${size}" fill="${background === "green" ? BG : background}"/>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${bgRect}
  <g transform="translate(${size / 2} ${size / 2}) scale(${MARK_SCALE}) translate(${-CX} ${-CY})">
    ${pathsOnly}
  </g>
</svg>`;
}

function wrapMarkMonochrome(size) {
  const mark = readFileSync(join(assets, "app-icon-p-mark.svg"), "utf8");
  const inner = mark
    .replace(/<\?xml[^?]*\?>\s*/i, "")
    .replace(/<!--[\s\S]*?-->\s*/g, "")
    .replaceAll(GOLD, "#ffffff");
  const pathsOnly = inner.replace(/<svg\b[\s\S]*?>/i, "").replace(/<\/svg>\s*$/i, "");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <g transform="translate(${size / 2} ${size / 2}) scale(${MARK_SCALE}) translate(${-CX} ${-CY})">
    ${pathsOnly}
  </g>
</svg>`;
}

function renderPng(svgString, outPath, { width }) {
  const resvg = new Resvg(svgString, {
    fitTo: { mode: "width", value: width },
    background: "transparent",
  });
  const png = resvg.render();
  writeFileSync(outPath, png.asPng());
  console.log("wrote", outPath);
}

const full1024 = wrapMark({ size: 1024, background: "green" });
renderPng(full1024, join(assets, "icon.png"), { width: 1024 });
renderPng(full1024, join(assets, "splash-icon.png"), { width: 1024 });

const fg1024 = wrapMark({ size: 1024, background: "none" });
renderPng(fg1024, join(assets, "android-icon-foreground.png"), { width: 1024 });

const bg1024 = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="${BG}"/>
</svg>`;
renderPng(bg1024, join(assets, "android-icon-background.png"), { width: 1024 });

const mono1024 = wrapMarkMonochrome(1024);
renderPng(mono1024, join(assets, "android-icon-monochrome.png"), { width: 1024 });

const fav = wrapMark({ size: 64, background: "green" });
renderPng(fav, join(assets, "favicon.png"), { width: 64 });
