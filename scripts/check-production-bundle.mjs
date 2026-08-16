import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const bundleRoots = [
  fileURLToPath(new URL('../apps/web/dist/', import.meta.url)),
  fileURLToPath(new URL('../apps/office-addin/dist/', import.meta.url)),
];
const prohibited = [
  'Enter development demo',
  'mergecom.demo-session',
  'alpha-owner',
  'Continue with local identity',
  'reviewer@example.test',
  'password123',
];

async function textFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? textFiles(path) : [path];
    }),
  );
  return files
    .flat()
    .filter((path) => ['.css', '.html', '.js'].includes(extname(path)));
}

const matches = [];
for (const bundleRoot of bundleRoots) {
  for (const path of await textFiles(bundleRoot)) {
    const contents = await readFile(path, 'utf8');
    for (const value of prohibited) {
      if (contents.includes(value)) matches.push(`${value} in ${path}`);
    }
  }
}

if (matches.length) {
  throw new Error(
    `Production bundle contains development authentication material:\n${matches.join('\n')}`,
  );
}

console.log(
  'Web and Office production bundles exclude development authentication material.',
);
