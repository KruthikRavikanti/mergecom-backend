import { describe, expect, it } from 'vitest';

import {
  detectSetupPlatform,
  documentKindForSetupHost,
  setupSteps,
} from './setup-guidance';

describe('Office setup guidance', () => {
  it('selects only the operational platform category', () => {
    expect(detectSetupPlatform({ platform: 'MacIntel' })).toBe('mac');
    expect(detectSetupPlatform({ userAgent: 'Windows NT 10.0' })).toBe(
      'windows',
    );
    expect(detectSetupPlatform({ userAgent: 'X11; Linux x86_64' })).toBe('web');
  });

  it('uses the host-specific Mac sideload folder', () => {
    expect(setupSteps({ host: 'powerpoint', platform: 'mac' })[1]).toContain(
      'com.microsoft.Powerpoint',
    );
    expect(documentKindForSetupHost('excel')).toBe('spreadsheet');
  });
});
