import { gzipSync } from 'node:zlib';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const dist = resolve('apps/web/dist');
const manifest = JSON.parse(
  readFileSync(resolve(dist, '.vite/manifest.json'), 'utf8'),
);
const entryKey = Object.keys(manifest).find((key) => manifest[key]?.isEntry);
if (!entryKey) throw new Error('Vite manifest has no client entry.');

const keys = new Set();
function collect(key) {
  if (keys.has(key)) return;
  keys.add(key);
  const chunk = manifest[key];
  for (const imported of chunk?.imports ?? []) collect(imported);
}

collect(entryKey);
for (const [key] of Object.entries(manifest)) {
  if (
    key.endsWith('/features/marketing/pages/MarketingHomePage.tsx') ||
    key.endsWith('/components/layout/PublicLayout.tsx')
  ) {
    collect(key);
  }
}

let gzipBytes = 0;
let source = '';
for (const key of keys) {
  const file = manifest[key]?.file;
  if (!file?.endsWith('.js')) continue;
  const bytes = readFileSync(resolve(dist, file));
  gzipBytes += gzipSync(bytes).byteLength;
  source += bytes.toString('utf8');
}

const budgetBytes = 180 * 1024;
if (gzipBytes > budgetBytes) {
  throw new Error(
    `Initial marketing JavaScript is ${gzipBytes} bytes gzip; budget is ${budgetBytes}.`,
  );
}

const forbiddenMarkers = ['pdfjsVersion', 'VisualComparisonWorkspace'];
for (const marker of forbiddenMarkers) {
  if (source.includes(marker)) {
    throw new Error(
      `Initial marketing chunks contain protected marker ${marker}.`,
    );
  }
}

const poster = resolve('apps/web/public/marketing/comparison-workspace.webp');
const posterBytes = statSync(poster).size;
if (posterBytes > 250 * 1024) {
  throw new Error(`Hero poster is ${posterBytes} bytes; budget is 256000.`);
}

console.log(
  `Marketing bundle: ${gzipBytes} bytes gzip JavaScript; hero poster: ${posterBytes} bytes.`,
);
