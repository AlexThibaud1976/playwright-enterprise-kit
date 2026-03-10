/**
 * Playwright Enterprise Kit - Sanity test
 *
 * This test verifies that the framework is correctly configured.
 * Replace BASE_URL and assertions with your target application.
 *
 * To link this test to a Jira/Xray test, uncomment and fill in:
 *   test.info().annotations.push({ type: 'test_key', value: 'PROJ-42' });
 */

import { test, expect } from '@playwright/test';
import { captureEvidence } from '../../utils/helpers';

test.describe('Sanity - Framework health check', () => {
  test('Homepage loads successfully', async ({ page }, testInfo) => {
    // ──────────────────────────────────────────────────────────────────────
    // Replace the URL below with your target application.
    // In production, use BASE_URL via the environment variable:
    //   baseURL is configured in playwright.config.ts → process.env.BASE_URL
    // ──────────────────────────────────────────────────────────────────────
    await page.goto('/');

    // Basic check: the page title must not be empty
    const title = await page.title();
    expect(title).toBeTruthy();
    console.log(`Page title: ${title}`);

    // Capture evidence (optional, for Xray reports)
    await captureEvidence(page, testInfo, 'homepage-loaded');
  });

  test('Page responds within timeout', async ({ page }) => {
    const start = Date.now();
    await page.goto('/');
    const duration = Date.now() - start;

    // The page must load in less than 30 seconds
    expect(duration).toBeLessThan(30000);
    console.log(`Page load time: ${duration}ms`);
  });
});
