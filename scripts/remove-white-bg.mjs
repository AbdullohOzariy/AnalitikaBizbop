import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";

const [, , input, output] = process.argv;
if (!input || !output) {
  console.error("Usage: node remove-white-bg.mjs <input.png> <output.png>");
  process.exit(1);
}

const img = sharp(input).ensureAlpha();
const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });

const threshold = 240; // 240+ = oq deb hisoblanadi
const tolerance = 15; // anti-alias yumshatish

for (let i = 0; i < data.length; i += 4) {
  const r = data[i],
    g = data[i + 1],
    b = data[i + 2];
  const minChan = Math.min(r, g, b);
  if (minChan >= threshold) {
    data[i + 3] = 0; // to'liq shaffof
  } else if (minChan >= threshold - tolerance) {
    // chetlarni yumshatish
    const t = (minChan - (threshold - tolerance)) / tolerance;
    data[i + 3] = Math.round(data[i + 3] * (1 - t));
  }
}

await sharp(data, {
  raw: { width: info.width, height: info.height, channels: 4 },
})
  .png()
  .toFile(output);

console.log(`Saqlandi: ${output} (${info.width}x${info.height})`);
