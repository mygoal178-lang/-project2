import { test, expect } from '@playwright/test';

test.describe('OrderFlow smoke', () => {
  test('landing page renders without crashing', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(20);
  });

  test('does not expose service role or encryption secrets in HTML', async ({ page }) => {
    await page.goto('/');
    const content = await page.content();
    expect(content).not.toMatch(/SERVICE_ROLE/i);
    expect(content).not.toMatch(/CREDENTIALS_ENCRYPTION_KEY/i);
  });
});
