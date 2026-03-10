/**
 * Playwright Enterprise Kit - Generic utilities
 *
 * Reusable project-agnostic functions:
 * - Evidence capture (screenshots for Xray)
 * - Unique test data
 * - Wait helpers
 * - BrowserStack-compatible URL assertion
 */

import { Page, TestInfo, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/** Storage directory for evidence screenshots */
export const EVIDENCE_DIR = 'test-results/evidence';

// ── Evidence ────────────────────────────────────────────────────────────────

/**
 * Takes a screenshot and attaches it as evidence to the Playwright / Xray report.
 *
 * @param page     - Playwright page
 * @param testInfo - Current test info
 * @param name     - Descriptive name for the screenshot
 * @returns Path to the created file
 */
export async function captureEvidence(
  page: Page,
  testInfo: TestInfo,
  name: string
): Promise<string> {
  if (!fs.existsSync(EVIDENCE_DIR)) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  }

  const timestamp = Date.now();
  const sanitizedName = name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
  // Prefix with test_key if available (for Xray integration)
  const annotation = testInfo.annotations.find(a => a.type === 'test_key');
  const testKey = annotation?.description || 'test';
  const filename = `${testKey}_${sanitizedName}_${timestamp}.png`;
  const filepath = path.join(EVIDENCE_DIR, filename);

  try {
    await page.screenshot({
      path: filepath,
      fullPage: false, // viewport only (avoids timeouts on BrowserStack)
      timeout: 5000,
    });
    await testInfo.attach(name, { path: filepath, contentType: 'image/png' });
    console.log(`[evidence] ${name} -> ${filename}`);
  } catch (error) {
    console.error(`[evidence] Screenshot failed: ${(error as Error).message}`);
  }

  return filepath;
}

/**
 * Runs an assertion then captures a screenshot if it passes.
 */
export async function verifyWithEvidence(
  page: Page,
  testInfo: TestInfo,
  assertion: () => Promise<void>,
  evidenceName: string
): Promise<void> {
  await assertion();
  await captureEvidence(page, testInfo, evidenceName);
}

// ── Test data ───────────────────────────────────────────────────────────────

/**
 * Generates unique user data based on the current timestamp.
 * Useful to avoid conflicts between parallel runs.
 */
export function generateUserData(prefix = 'test') {
  const ts = Date.now();
  return {
    firstName: `${prefix}_${ts}`,
    lastName: `Auto_${ts}`,
    email: `${prefix}_${ts}@example.com`,
    password: 'Test@123456',
  };
}

/**
 * Retourne un timestamp unique (ms depuis epoch).
 */
export function getTimestamp(): number {
  return Date.now();
}

// ── Attente ─────────────────────────────────────────────────────────────────

/**
 * Waits for a fixed delay in milliseconds.
 * Use sparingly — prefer Playwright assertions whenever possible.
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── URL ─────────────────────────────────────────────────────────────────────

/**
 * BrowserStack-compatible URL assertion (avoids expect(page).toHaveURL
 * which is not supported on BrowserStack mobile mode).
 *
 * @param page     - Playwright page
 * @param expected - Expected URL (string or RegExp)
 * @param timeout  - Timeout in ms (default: 10000)
 */
export async function assertUrl(
  page: Page,
  expected: string | RegExp,
  timeout = 10000
): Promise<void> {
  try {
    await page.waitForURL(expected, { timeout, waitUntil: 'networkidle' });
  } catch (err) {
    const current = page.url();
    throw new Error(
      `URL mismatch.\n  Expected: ${expected}\n  Got: ${current}\n  ${(err as Error).message}`
    );
  }
}

// ── Test cards ──────────────────────────────────────────────────────────────

/**
 * Standard test credit cards (Adyen/Stripe test card format).
 * These numbers only work in test environments.
 */
export const TEST_CARDS = {
  visa: {
    holderName: 'Visa Test',
    number: '4111111111111111',
    expMonth: '12',
    expYear: '2027',
    cvv: '737',
    type: 'Visa',
  },
  mastercard: {
    holderName: 'Mastercard Test',
    number: '5555555555554444',
    expMonth: '12',
    expYear: '2027',
    cvv: '737',
    type: 'Master card',
  },
  amex: {
    holderName: 'Amex Test',
    number: '370000000000002',
    expMonth: '12',
    expYear: '2027',
    cvv: '7373',
    type: 'Amex',
  },
} as const;

export type TestCardKey = keyof typeof TEST_CARDS;
