import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadRenditionEngineConfig } from '../src/config';
import { OfficeRenderer } from '../src/renderer';

const runIntegration = process.env.RUN_RENDITION_ENGINE_INTEGRATION === 'true';
const fixtures = resolve(process.cwd(), '../../packages/test-fixtures/office');

describe.runIf(runIntegration)('pinned Office renderer', () => {
  it('renders all standard formats with stable bounded page structure', async () => {
    const renderer = new OfficeRenderer(loadRenditionEngineConfig());
    for (const [name, extension] of [
      ['visual-word.docx', '.docx'],
      ['visual-excel.xlsx', '.xlsx'],
      ['visual-powerpoint.pptx', '.pptx'],
    ] as const) {
      const bytes = await readFile(resolve(fixtures, name));
      const sourceSha256 = createHash('sha256').update(bytes).digest('hex');
      const first = await renderer.render({
        bytes,
        extension,
        sourceSha256,
        traceId: randomUUID(),
      });
      const second = await renderer.render({
        bytes,
        extension,
        sourceSha256,
        traceId: randomUUID(),
      });
      expect(first.manifest.pageCount).toBeGreaterThan(0);
      expect(first.manifest.pageCount).toBe(second.manifest.pageCount);
      expect(first.manifest.dimensions).toEqual(second.manifest.dimensions);
      expect(first.pdf.byteLength).toBeGreaterThan(0);
      expect(first.pdf.byteLength).toBeLessThanOrEqual(
        loadRenditionEngineConfig().maxOutputBytes,
      );
    }
  }, 180_000);

  it('rejects corrupt, external-link, and macro-enabled fixtures', async () => {
    const renderer = new OfficeRenderer(loadRenditionEngineConfig());
    for (const [name, extension, code] of [
      ['corrupt-office.docx', '.docx', 'invalid_office_package'],
      [
        'external-link-excel.xlsx',
        '.xlsx',
        'external_relationships_not_allowed',
      ],
      ['macro-word.docm', '.docm', 'unsupported_office_format'],
    ] as const) {
      const bytes = await readFile(resolve(fixtures, name));
      await expect(
        renderer.render({
          bytes,
          extension,
          sourceSha256: createHash('sha256').update(bytes).digest('hex'),
          traceId: randomUUID(),
        }),
      ).rejects.toEqual(expect.objectContaining({ code }));
    }
  });
});
