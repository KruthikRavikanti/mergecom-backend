import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const localOrigin = 'https://localhost:5176';
const manifestNames = [
  'manifest.word.xml',
  'manifest.excel.xml',
  'manifest.powerpoint.xml',
];

export function validateOfficeOrigin(value) {
  let origin;
  try {
    origin = new URL(value);
  } catch {
    throw new Error('OFFICE_ADDIN_ORIGIN must be an absolute HTTPS origin.');
  }
  if (
    origin.protocol !== 'https:' ||
    origin.origin !== value ||
    origin.hostname === 'localhost' ||
    origin.hostname === '127.0.0.1'
  ) {
    throw new Error('OFFICE_ADDIN_ORIGIN must be an absolute HTTPS origin.');
  }
  return origin.origin;
}

export async function renderOfficeManifests(originValue, outputDirectory) {
  const origin = validateOfficeOrigin(originValue);
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const sourceDirectory = resolve(scriptDirectory, '../../apps/office-addin');
  await mkdir(outputDirectory, { recursive: true });

  for (const name of manifestNames) {
    const source = await readFile(resolve(sourceDirectory, name), 'utf8');
    const occurrences = source.split(localOrigin).length - 1;
    if (occurrences !== 4) {
      throw new Error(`${name} must contain exactly four local origin values.`);
    }
    const rendered = source.replaceAll(localOrigin, origin);
    await writeFile(resolve(outputDirectory, basename(name)), rendered, 'utf8');
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [, , origin, outputDirectory] = process.argv;
  if (!origin || !outputDirectory) {
    throw new Error(
      'Usage: node render-office-manifests.mjs <office-origin> <output-directory>',
    );
  }
  await renderOfficeManifests(origin, resolve(outputDirectory));
}
