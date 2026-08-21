import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const marketingRoutes = [
  '/',
  '/product',
  '/security',
  '/support',
  '/request-access',
] as const;

test.describe('marketing website', () => {
  for (const route of marketingRoutes) {
    test(`${route} is accessible and stable`, async ({ page }, testInfo) => {
      const consoleErrors: string[] = [];
      const failedRequests: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });
      page.on('requestfailed', (request) => failedRequests.push(request.url()));

      await page.goto(route);
      await expect(page.locator('h1')).toHaveCount(1);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        ),
      ).toBeLessThanOrEqual(1);
      expect(consoleErrors).toEqual([]);
      expect(failedRequests).toEqual([]);

      if (testInfo.project.name === 'desktop-chromium') {
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
          .analyze();
        expect(results.violations).toEqual([]);
      }
    });
  }

  test('initial viewport and major chapters remain deterministic', async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('.marketing-hero')).toHaveAttribute(
      'data-motion',
      'reduced',
    );
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath(`marketing-home-${testInfo.project.name}.png`),
    });

    if (testInfo.project.name === 'desktop-chromium') {
      await page.locator('#product-showcase').screenshot({
        animations: 'disabled',
        path: testInfo.outputPath('marketing-product-showcase.png'),
      });
      await page.locator('#workflow').screenshot({
        animations: 'disabled',
        path: testInfo.outputPath('marketing-workflow.png'),
      });
      await page.locator('#security').screenshot({
        animations: 'disabled',
        path: testInfo.outputPath('marketing-security.png'),
      });
    }
  });

  test('mobile navigation is keyboard operable and restores focus', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-chromium');
    await page.goto('/');
    const trigger = page.getByRole('button', { name: 'Open navigation' });
    await trigger.click();
    await expect(
      page.getByRole('dialog', { name: 'Mobile primary navigation' }),
    ).toBeVisible();
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('marketing-mobile-navigation.png'),
    });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test('format selector follows tab keyboard semantics', async ({ page }) => {
    await page.goto('/#formats');
    const word = page.getByRole('tab', { name: 'Word' });
    await word.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Excel' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('tabpanel', { name: 'Excel' })).toContainText(
      'formulas',
    );
  });

  test('request access states that the unconfigured channel submits nothing', async ({
    page,
  }, testInfo) => {
    await page.goto('/request-access');
    await expect(page.getByRole('form')).toHaveCount(0);
    await expect(
      page.getByText('No information has been collected or submitted.'),
    ).toBeVisible();
    if (testInfo.project.name === 'mobile-chromium') {
      await page.screenshot({
        animations: 'disabled',
        fullPage: true,
        path: testInfo.outputPath('marketing-request-access.png'),
      });
    }
  });
});
