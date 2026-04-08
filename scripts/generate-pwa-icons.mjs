#!/usr/bin/env node
/**
 * Generate square PWA icons from kr8tiv-logo.png.
 * The source is 616x244 (landscape), so we center it on a square
 * canvas matching the KIN dark background (#09090b).
 */
import sharp from 'sharp';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = join(__dirname, '..', 'web', 'public', 'kr8tiv-logo.png');
const outDir = join(__dirname, '..', 'web', 'public', 'icons');

const sizes = [192, 512];

for (const size of sizes) {
  // Resize the logo to fit within the square with padding
  const resized = await sharp(src)
    .resize({
      width: Math.round(size * 0.75),
      height: Math.round(size * 0.75),
      fit: 'inside',
      background: { r: 9, g: 9, b: 11, alpha: 1 },
    })
    .toBuffer();

  // Get actual resized dimensions
  const meta = await sharp(resized).metadata();

  // Composite onto a square canvas with the KIN dark background
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 9, g: 9, b: 11, alpha: 1 },
    },
  })
    .composite([{
      input: resized,
      left: Math.round((size - meta.width) / 2),
      top: Math.round((size - meta.height) / 2),
    }])
    .png()
    .toFile(join(outDir, `icon-${size}x${size}.png`));

  console.log(`Generated icon-${size}x${size}.png`);
}

console.log('Done.');
