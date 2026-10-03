// Renders the app icon set from one SVG mark. Run with `npm run icons -w client`.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/icons');
await fs.mkdir(outDir, { recursive: true });

const mark = (stroke1 = '#ffffff', stroke2 = '#ffd9c7') => `
  <circle cx="208" cy="256" r="100" fill="none" stroke="${stroke1}" stroke-width="34"/>
  <circle cx="304" cy="256" r="100" fill="none" stroke="${stroke2}" stroke-width="34"/>`;

const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="116" fill="#d4613e"/>${mark()}</svg>`;
const fullBleed = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#d4613e"/><g transform="translate(51 51) scale(0.8)">${mark()}</g></svg>`;
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${mark('#ffffff', '#ffffff')}</svg>`;

await fs.writeFile(path.join(outDir, 'favicon.svg'), rounded.trim());
const render = (svg, size, file) => sharp(Buffer.from(svg)).resize(size, size).png().toFile(path.join(outDir, file));
await Promise.all([
  render(rounded, 192, 'icon-192.png'),
  render(rounded, 512, 'icon-512.png'),
  render(fullBleed, 512, 'maskable-512.png'),
  render(fullBleed, 180, 'apple-touch-icon.png'),
  render(badge, 96, 'badge-96.png'),
]);
console.log(`Icons written to ${outDir}`);
