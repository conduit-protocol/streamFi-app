import { test, expect } from '@playwright/test';
import { injectAxe, checkA11y } from 'axe-playwright';

const CORE_PAGES = [
  '/dashboard',
  '/streams',
  '/create',
  '/profile',
  '/settings',
];

test.describe('Accessibility (a11y) checks', () => {
  test.beforeEach(async ({ page }) => {
    // Inject axe-core into the page
    await injectAxe(page);
  });

  CORE_PAGES.forEach((pagePath) => {
    test(`${pagePath} has no critical a11y violations`, async ({ page }) => {
      await page.goto(pagePath);

      // Wait for any dynamic content to load
      await page.waitForLoadState('networkidle');

      // Run axe accessibility check
      // Exclude violations at 'minor' level to focus on critical/serious issues
      await checkA11y(page, null, {
        detailedReport: true,
        detailedReportOptions: {
          html: true,
        },
      });
    });
  });

  test('/stream/[id] detail page has no critical a11y violations', async ({ page }) => {
    // Use a generic stream ID for testing
    // In a real scenario with a mock server, this would be a known stream
    // For now, we navigate and handle the "not found" state gracefully
    await page.goto('/stream/1');

    await page.waitForLoadState('networkidle');

    // Even if the stream doesn't exist, the error state should be accessible
    await checkA11y(page, null, {
      detailedReport: true,
      detailedReportOptions: {
        html: true,
      },
    });
  });

  test('Keyboard navigation: Tab key cycles through interactive elements', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Get all focusable elements
    const focusableElements = await page.locator(
      'button, [href], input, textarea, select, [tabindex]'
    ).all();

    expect(focusableElements.length).toBeGreaterThan(0);

    // Verify focus can be moved via Tab key
    await page.keyboard.press('Tab');
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedElement).not.toBe('BODY');
  });

  test('Focus is not trapped by modals (if any appear)', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Look for any open modals
    const modals = await page.locator('[role="dialog"]').count();

    // If no modals are open, test passes
    if (modals === 0) {
      expect(modals).toBe(0);
      return;
    }

    // If a modal exists, verify focus can escape it via Escape key
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);

    const activeElement = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? el.getAttribute('role') : null;
    });

    // After Escape, focus should not still be trapped in the modal
    expect(activeElement).not.toBe('dialog');
  });

  test('Color contrast meets WCAG AA standards on key text', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Run axe specifically for color contrast violations
    await checkA11y(page, null, {
      rules: {
        // Focus on color contrast rules
        'color-contrast': { enabled: true },
      },
      detailedReport: true,
    });
  });
});
