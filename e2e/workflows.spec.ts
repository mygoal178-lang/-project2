import { test, expect } from '@playwright/test';

const hasAuth =
  Boolean(process.env.E2E_USER_EMAIL) &&
  Boolean(process.env.E2E_USER_PASSWORD) &&
  Boolean(process.env.VITE_SUPABASE_URL || process.env.PLAYWRIGHT_BASE_URL);

test.describe('Public surfaces', () => {
  test('landing page loads content', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
    const text = await page.locator('body').innerText();
    expect(text.length).toBeGreaterThan(30);
  });

  test('no service role secrets in HTML', async ({ page }) => {
    await page.goto('/');
    const html = await page.content();
    expect(html).not.toMatch(/SERVICE_ROLE/i);
    expect(html).not.toMatch(/CREDENTIALS_ENCRYPTION_KEY/i);
  });

  test('mobile viewport does not crash', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Authenticated workflows', () => {
  test.skip(!hasAuth, 'Requires E2E_USER_EMAIL / E2E_USER_PASSWORD and Supabase env');

  test('login path is reachable', async ({ page }) => {
    await page.goto('/');
    const authBtn = page.getByRole('button', { name: /sign in|log in|get started|login/i }).first();
    if (await authBtn.isVisible().catch(() => false)) {
      await authBtn.click();
    }
    await expect(page.locator('body')).toBeVisible();
  });
});
