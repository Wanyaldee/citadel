// One-off icon generator: renders assets/branding/citadel-logo-mark.svg onto
// a rounded-square background per release channel and writes out the PNG
// files consumed by crates/zed/resources. Not part of the normal build -
// run manually (via `node script/generate-app-icons.mjs`) when the source
// SVG changes. Requires `npm install sharp` in script/ (devDependency-less,
// intentionally not committed to package.json - see script/README if one
// exists).
import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(__dirname);
const markSvgPath = path.join(repoRoot, "assets", "branding", "citadel-logo-mark.svg");
const resourcesDir = path.join(repoRoot, "crates", "zed", "resources");
const windowsDir = path.join(resourcesDir, "windows");

const markSvg = readFileSync(markSvgPath, "utf8");

// Background color per channel, matching the rounded-square + centered-mark
// convention used by the previous Zed icon set (stable=near-black,
// dev=grey, nightly=deep navy, preview=blue).
const CHANNELS = {
  "": "#0d1117",
  "-dev": "#8a8a8a",
  "-nightly": "#0a0f2e",
  "-preview": "#1f6fd6",
};

function roundedSquareSvg(size, color, cornerRatio = 0.225) {
  const r = Math.round(size * cornerRatio);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<rect x="0" y="0" width="${size}" height="${size}" rx="${r}" ry="${r}" fill="${color}"/>` +
      `</svg>`
  );
}

async function composeIcon(size, color, markScale = 0.72) {
  const bg = roundedSquareSvg(size, color);
  const markSize = Math.round(size * markScale);
  const markPng = await sharp(Buffer.from(markSvg), { density: 384 })
    .resize(markSize, markSize)
    .png()
    .toBuffer();
  const offset = Math.round((size - markSize) / 2);
  return sharp(bg)
    .composite([{ input: markPng, left: offset, top: offset }])
    .png()
    .toBuffer();
}

async function main() {
  mkdirSync(windowsDir, { recursive: true });

  for (const [suffix, color] of Object.entries(CHANNELS)) {
    const png512 = await composeIcon(512, color);
    const png1024 = await composeIcon(1024, color);
    writeFileSync(path.join(resourcesDir, `app-icon${suffix}.png`), png512);
    writeFileSync(path.join(resourcesDir, `app-icon${suffix}@2x.png`), png1024);
    console.log(`wrote app-icon${suffix}.png / @2x.png`);
  }

  // macOS Document.icns is generated separately (see script/generate-app-icons-icns-and-ico.py,
  // which converts the PNGs written above into .ico/.icns using Pillow).
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
