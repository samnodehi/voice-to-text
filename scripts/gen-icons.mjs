// Rasterizes assets/icon.svg into the extension's PNG icons.
// Run with: node scripts/gen-icons.mjs   (after editing assets/icon.svg)
import sharp from 'sharp';
import { readFileSync, statSync } from 'node:fs';
// sharp's toFile() wants a real filesystem path, not a URL object. fileURLToPath is also the
// only correct way to get one here: this project's own path contains spaces, so URL.pathname
// would hand back a percent-encoded string that does not exist on disk.
import { fileURLToPath } from 'node:url';

const svg = readFileSync(new URL('../assets/icon.svg', import.meta.url));
const sizes = [16, 32, 48, 96, 128];

for (const s of sizes) {
  const out = fileURLToPath(new URL(`../public/icon/${s}.png`, import.meta.url));
  // High density so the vector is crisp before downscaling to the target size.
  await sharp(svg, { density: 384 }).resize(s, s).png().toFile(out);
  console.log(`icon/${s}.png (${statSync(out).size} bytes)`);
}
