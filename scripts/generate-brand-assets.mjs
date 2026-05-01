import { promises as fs } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const sourcePath = process.argv[2];
const outputDir = process.argv[3] || path.resolve('assets', 'brand');

if (!sourcePath) {
  throw new Error('Usage: node scripts/generate-brand-assets.mjs <source-image> [output-dir]');
}

await fs.mkdir(outputDir, { recursive: true });

const source = sharp(sourcePath).ensureAlpha();
const { data, info } = await source.raw().toBuffer({ resolveWithObject: true });
const width = info.width;
const height = info.height;

const mask = new Uint8Array(width * height);
let minX = width;
let minY = height;
let maxX = 0;
let maxY = 0;

for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const index = (y * width + x) * info.channels;
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const a = data[index + 3];
    const isInk = a > 0 && !(r > 246 && g > 246 && b > 246);
    if (!isInk) continue;
    mask[y * width + x] = 1;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
}

if (minX >= maxX || minY >= maxY) {
  throw new Error('Could not detect logo bounds.');
}

const bbox = {
  left: Math.max(0, minX - 20),
  top: Math.max(0, minY - 20),
  width: Math.min(width - Math.max(0, minX - 20), maxX - minX + 41),
  height: Math.min(height - Math.max(0, minY - 20), maxY - minY + 41)
};

const rowCounts = [];
for (let y = bbox.top; y < bbox.top + bbox.height; y += 1) {
  let count = 0;
  for (let x = bbox.left; x < bbox.left + bbox.width; x += 1) {
    count += mask[y * width + x];
  }
  rowCounts.push(count);
}

const splitStart = Math.floor(rowCounts.length * 0.42);
const splitEnd = Math.floor(rowCounts.length * 0.86);
let splitIndex = splitStart;
let splitValue = Number.POSITIVE_INFINITY;
for (let i = splitStart; i < splitEnd; i += 1) {
  if (rowCounts[i] > 0 && rowCounts[i] < splitValue) {
    splitValue = rowCounts[i];
    splitIndex = i;
  }
}

const markRegion = {
  left: bbox.left,
  top: bbox.top,
  width: bbox.width,
  height: Math.max(1, splitIndex - 8)
};

const markRows = [];
for (let y = markRegion.top; y < markRegion.top + markRegion.height; y += 1) {
  let start = width;
  let end = 0;
  for (let x = markRegion.left; x < markRegion.left + markRegion.width; x += 1) {
    if (!mask[y * width + x]) continue;
    if (x < start) start = x;
    if (x > end) end = x;
  }
  markRows.push({ start, end });
}

let markMinX = width;
let markMaxX = 0;
let markMinY = height;
let markMaxY = 0;
markRows.forEach((row, index) => {
  if (row.start >= row.end) return;
  if (row.start < markMinX) markMinX = row.start;
  if (row.end > markMaxX) markMaxX = row.end;
  const y = markRegion.top + index;
  if (y < markMinY) markMinY = y;
  if (y > markMaxY) markMaxY = y;
});

const tightMark = {
  left: Math.max(0, markMinX - 18),
  top: Math.max(0, markMinY - 18),
  width: Math.max(1, Math.min(width - Math.max(0, markMinX - 18), markMaxX - markMinX + 37)),
  height: Math.max(1, Math.min(height - Math.max(0, markMinY - 18), markMaxY - markMinY + 37))
};

const rgba = Buffer.from(data);
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const alphaIndex = (y * width + x) * info.channels + 3;
    rgba[alphaIndex] = mask[y * width + x] ? 255 : 0;
  }
}

const transparent = await sharp(rgba, {
  raw: {
    width,
    height,
    channels: info.channels
  }
})
  .png()
  .toBuffer();

const transparentBase = sharp(transparent);
const logoFull = await transparentBase.clone().extract(bbox).png().toBuffer();
const markBase = await transparentBase.clone().extract(tightMark).png().toBuffer();

const darkWordmark = await transparentBase
  .clone()
  .extract(bbox)
  .composite([
    {
      input: Buffer.from(
        `<svg width="${bbox.width}" height="${bbox.height}" xmlns="http://www.w3.org/2000/svg">
          <rect x="0" y="${splitIndex + 6}" width="${bbox.width}" height="${bbox.height - splitIndex}" fill="#F5F7FF"/>
        </svg>`
      ),
      blend: 'atop'
    }
  ])
  .png()
  .toBuffer();

const logoPngPath = path.join(outputDir, 'logo.png');
const logoDarkPath = path.join(outputDir, 'logo-dark.png');
const markPath = path.join(outputDir, 'logo-mark.png');
const favicon32Path = path.join(outputDir, 'favicon-32x32.png');
const ogImagePath = path.join(outputDir, 'og-preview.png');
const faviconIcoPath = path.join(outputDir, 'favicon.ico');

await sharp(darkWordmark).resize({ width: 1400 }).png().toFile(logoPngPath);
await sharp(logoFull).resize({ width: 1400 }).png().toFile(logoDarkPath);

const markCanvas = await sharp({
  create: {
    width: 1024,
    height: 1024,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 }
  }
})
  .composite([
    {
      input: await sharp(markBase).resize({ width: 820, height: 820, fit: 'contain' }).png().toBuffer(),
      left: 102,
      top: 102
    }
  ])
  .png()
  .toBuffer();

await sharp(markCanvas).png().toFile(markPath);
await sharp(markCanvas).resize(32, 32).png().toFile(favicon32Path);

const ogBackground = Buffer.from(
  `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#090B1E"/>
        <stop offset="45%" stop-color="#17133D"/>
        <stop offset="100%" stop-color="#0B2440"/>
      </linearGradient>
      <radialGradient id="glowA" cx="24%" cy="18%" r="45%">
        <stop offset="0%" stop-color="rgba(146, 43, 255, 0.50)"/>
        <stop offset="100%" stop-color="rgba(146, 43, 255, 0)"/>
      </radialGradient>
      <radialGradient id="glowB" cx="84%" cy="22%" r="42%">
        <stop offset="0%" stop-color="rgba(49, 190, 255, 0.38)"/>
        <stop offset="100%" stop-color="rgba(49, 190, 255, 0)"/>
      </radialGradient>
    </defs>
    <rect width="1200" height="630" rx="36" fill="url(#bg)"/>
    <rect width="1200" height="630" rx="36" fill="url(#glowA)"/>
    <rect width="1200" height="630" rx="36" fill="url(#glowB)"/>
    <g stroke="rgba(255,255,255,0.06)">
      <path d="M0 500 C220 460 320 540 560 500 S930 420 1200 500" fill="none"/>
      <path d="M0 540 C220 500 320 580 560 540 S930 460 1200 540" fill="none"/>
    </g>
    <text x="90" y="124" fill="rgba(242,245,255,0.72)" font-family="Inter, Segoe UI, sans-serif" font-size="24" letter-spacing="5">AURAFLOW</text>
    <text x="90" y="520" fill="#D5D9F5" font-family="Inter, Segoe UI, sans-serif" font-size="28">Omnichannel conversations, leads, and AI-assisted follow-up.</text>
  </svg>`
);

const ogLogo = await sharp(darkWordmark).resize({ width: 560 }).png().toBuffer();
await sharp(ogBackground)
  .composite([
    {
      input: ogLogo,
      left: 320,
      top: 120
    }
  ])
  .png()
  .toFile(ogImagePath);

const iconPngs = await Promise.all([16, 32, 48].map(async (size) => {
  const buffer = await sharp(markCanvas)
    .resize(size, size)
    .png()
    .toBuffer();
  return { size, buffer };
}));

const icoParts = [];
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(iconPngs.length, 4);
icoParts.push(header);

let offset = 6 + iconPngs.length * 16;
for (const icon of iconPngs) {
  const dir = Buffer.alloc(16);
  dir.writeUInt8(icon.size >= 256 ? 0 : icon.size, 0);
  dir.writeUInt8(icon.size >= 256 ? 0 : icon.size, 1);
  dir.writeUInt8(0, 2);
  dir.writeUInt8(0, 3);
  dir.writeUInt16LE(1, 4);
  dir.writeUInt16LE(32, 6);
  dir.writeUInt32LE(icon.buffer.length, 8);
  dir.writeUInt32LE(offset, 12);
  icoParts.push(dir);
  offset += icon.buffer.length;
}

iconPngs.forEach((icon) => icoParts.push(icon.buffer));
await fs.writeFile(faviconIcoPath, Buffer.concat(icoParts));

console.log(JSON.stringify({
  bbox,
  splitIndex,
  outputDir,
  files: [
    logoPngPath,
    logoDarkPath,
    markPath,
    favicon32Path,
    faviconIcoPath,
    ogImagePath
  ]
}, null, 2));
