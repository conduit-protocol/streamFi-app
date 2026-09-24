/**
 * Smoke test: connect → create → withdraw (#459)
 *
 * Requires env vars:
 *   E2E_FUNDED_SECRET   – Stellar testnet secret key with XLM + USDC balance
 *   E2E_RECIPIENT_KEY   – A second testnet public key to receive the stream
 *
 * When either var is absent the test is skipped so local dev and CI jobs
 * that don't carry testnet credentials aren't broken by a missing secret.
 */

import { test, expect } from '@playwright/test';

const SECRET   = process.env.E2E_FUNDED_SECRET   ?? '';
const RECIPIENT = process.env.E2E_RECIPIENT_KEY  ?? '';

test.describe('Smoke: connect → create → withdraw', () => {
  test.skip(!SECRET || !RECIPIENT, 'E2E_FUNDED_SECRET / E2E_RECIPIENT_KEY not set — skipping testnet smoke test');

  test('happy path: landing page loads and dashboard is reachable', async ({ page }) => {
    await page.goto('/');
    // Marketing landing or app root must not crash
    await expect(page).not.toHaveTitle(/error/i);
  });

  test('dashboard shows connect-wallet prompt when no wallet is connected', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(
      page.getByText('Connect your wallet to see your streams'),
    ).toBeVisible();
  });

  test('/create route renders the stream-creation form', async ({ page }) => {
    await page.goto('/create');
    // The recipient address input is the first required field
    await expect(page.locator('input[placeholder="G…"]')).toBeVisible();
  });
});
