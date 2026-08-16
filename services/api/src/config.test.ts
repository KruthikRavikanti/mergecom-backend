import { afterEach, describe, expect, it } from 'vitest';

import { loadConfig, safeReturnTo } from './config';

const originalEnvironment = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe('identity configuration', () => {
  it('refuses development identity in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_MODE = 'development';
    expect(loadConfig).toThrow('Development identity');
  });

  it('accepts only local application return paths', () => {
    expect(safeReturnTo('/app/team?filter=active')).toBe(
      '/app/team?filter=active',
    );
    expect(safeReturnTo('https://attacker.invalid')).toBe('/app');
    expect(safeReturnTo('//attacker.invalid')).toBe('/app');
  });

  it('accepts only the exact Office authentication callback URL', () => {
    const origin = 'https://office.mergecom.test';
    expect(
      safeReturnTo(
        'https://office.mergecom.test/office-auth.html?callback=1',
        origin,
      ),
    ).toBe('https://office.mergecom.test/office-auth.html?callback=1');
    expect(
      safeReturnTo(
        'https://office.mergecom.test/office-auth.html?callback=1&next=evil',
        origin,
      ),
    ).toBe('/app');
    expect(
      safeReturnTo(
        'https://office.mergecom.test.evil/office-auth.html?callback=1',
        origin,
      ),
    ).toBe('/app');
  });
});
