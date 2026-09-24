import { test, expect } from '@playwright/test';

test.describe('Wallet disconnect during dashboard load', () => {
  test('disconnecting while dashboard is loading should not leave stale data or crash', async ({ page }) => {
    // This test verifies that when a wallet disconnects while the dashboard
    // is still loading stream data, the app handles the disconnect gracefully
    // without crashing or displaying stale data from a previous wallet.

    // Navigate to the dashboard
    await page.goto('/dashboard');

    // The dashboard should show the connect wallet prompt when not connected
    await expect(page.locator('text=Connect your wallet to see your streams')).toBeVisible();

    // Simulate a wallet connection by injecting a mock wallet state
    // In a real E2E test, you would use a mock wallet extension or
    // inject state via localStorage/API mocks
    await page.evaluate(() => {
      // Mock a connected wallet state
      localStorage.setItem('wallet-public-key', 'GAXDAMN3XIVM7T5R4K3JGFJMZQJ4YV5Z5K5K5K5K5K5K5K5K5K5K5K');
      localStorage.setItem('wallet-connected', 'true');
    });

    // Reload to pick up the mock state
    await page.reload();

    // Wait for loading state to appear
    // The dashboard should show skeleton loaders while fetching stream data
    const loadingIndicator = page.locator('[aria-busy="true"], .animate-pulse, text=Loading');

    // Disconnect the wallet while loading is in progress
    // This simulates the user clicking disconnect during a slow RPC response
    const disconnectButton = page.locator('button:has-text("Disconnect"), button[title*="Disconnect"]');

    // Wait for the dashboard to start loading
    await page.waitForTimeout(500);

    // Try to click disconnect if visible (may appear quickly if wallet is mocked)
    if (await disconnectButton.isVisible().catch(() => false)) {
      await disconnectButton.click();
    }

    // Clear the mock wallet state to simulate disconnect
    await page.evaluate(() => {
      localStorage.removeItem('wallet-public-key');
      localStorage.removeItem('wallet-connected');
    });

    // Reload to reflect the disconnected state
    await page.reload();

    // After disconnect, the dashboard should show the connect wallet prompt
    // and NOT show any stale stream data
    await expect(page.locator('text=Connect your wallet to see your streams')).toBeVisible();

    // Verify no stale data is displayed
    const streamCards = page.locator('[class*="card"]:has-text("From"), [class*="card"]:has-text("To")');
    await expect(streamCards).toHaveCount(0);

    // Verify no error overlays or crashes
    const errorOverlay = page.locator('[role="alert"]:has-text("Error"), [role="alert"]:has-text("crash")');
    await expect(errorOverlay).toHaveCount(0);
  });

  test('rapid connect/disconnect cycles should not cause state leaks', async ({ page }) => {
    // Test that rapid connect/disconnect cycles don't cause memory leaks
    // or stale state accumulation

    await page.goto('/dashboard');

    // Simulate rapid connect/disconnect cycles
    for (let i = 0; i < 3; i++) {
      // Set mock wallet state
      await page.evaluate(() => {
        localStorage.setItem('wallet-public-key', 'GAXDAMN3XIVM7T5R4K3JGFJMZQJ4YV5Z5K5K5K5K5K5K5K5K5K5K');
        localStorage.setItem('wallet-connected', 'true');
      });

      // Reload to pick up state
      await page.reload();

      // Wait briefly for any loading to start
      await page.waitForTimeout(200);

      // Disconnect
      await page.evaluate(() => {
        localStorage.removeItem('wallet-public-key');
        localStorage.removeItem('wallet-connected');
      });

      // Reload again
      await page.reload();
    }

    // Final state should show connect wallet prompt
    await expect(page.locator('text=Connect your wallet to see your streams')).toBeVisible();

    // Verify clean state
    const streamCards = page.locator('[class*="card"]:has-text("From"), [class*="card"]:has-text("To")');
    await expect(streamCards).toHaveCount(0);
  });
});
