import { expect, test } from '@playwright/test';

const previewOrigin = 'http://127.0.0.1:4173';
const publicRoutes = [
  '/',
  '/product',
  '/security',
  '/support',
  '/request-access',
] as const;

test.describe('marketing prerender release', () => {
  test('approved public HTML hydrates without errors', async ({
    page,
    request,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium');

    for (const route of publicRoutes) {
      const response = await request.get(`${previewOrigin}${route}`);
      expect(response.ok()).toBe(true);
      const source = await response.text();
      expect(source).toContain('<div id="root"><');
      expect(source).toContain('<h1');

      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.goto(`${previewOrigin}${route}`);
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.locator('.marketing-site')).toBeVisible();
      expect(errors).toEqual([]);
    }
  });

  test('protected and unknown routes receive the empty SPA shell', async ({
    request,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-chromium');
    for (const route of ['/app', '/invite/example', '/not-a-public-route']) {
      const response = await request.get(`${previewOrigin}${route}`);
      const source = await response.text();
      expect(source).toContain('<div id="root"></div>');
      expect(source).toContain('noindex, nofollow');
      expect(source).not.toContain('marketing-hero');
    }
  });
});
