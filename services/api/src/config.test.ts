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
});
