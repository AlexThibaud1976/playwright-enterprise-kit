/**
 * Playwright Enterprise Kit - Login test example with POM
 *
 * Demonstrates the recommended Page Object Model (POM) pattern.
 * Adapt the selectors to your application.
 *
 * Recommended structure for your tests:
 *   - One file = one feature
 *   - One test = one independent scenario
 *   - test.beforeEach for common preconditions
 *   - test.afterEach for cleanup
 */

import { test, expect } from '@playwright/test';
import { generateUserData, captureEvidence } from '../../utils/helpers';

// ──────────────────────────────────────────────────────────────────────────────
// INLINE PAGE OBJECT EXAMPLE - Extract to pages/login.page.ts
// ──────────────────────────────────────────────────────────────────────────────

class LoginPage {
  constructor(private page: import('@playwright/test').Page) {}

  // Selectors — adapt to your application
  get emailInput() { return this.page.locator('input[name="email"], input[type="email"], #email'); }
  get passwordInput() { return this.page.locator('input[name="password"], input[type="password"], #password'); }
  get submitButton() { return this.page.locator('button[type="submit"], input[type="submit"]'); }
  get errorMessage() { return this.page.locator('[role="alert"], .error-message, .alert-danger'); }

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
    await this.page.waitForLoadState('networkidle');
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// TESTS
// ──────────────────────────────────────────────────────────────────────────────

test.describe('Login', () => {
  let loginPage: LoginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.goto();
  });

  test('Login page renders correctly', async ({ page }, testInfo) => {
    // Verify elements present on the page
    // Uncomment the assertions that match your application
    //
    // await expect(loginPage.emailInput).toBeVisible();
    // await expect(loginPage.passwordInput).toBeVisible();
    // await expect(loginPage.submitButton).toBeVisible();

    // Capture d'evidence
    await captureEvidence(page, testInfo, 'login-page');

    // Test placeholder: replace with real assertions
    expect(page.url()).toContain('login');
  });

  test('Login with valid credentials', async ({ page }, testInfo) => {
    // ────────────────────────────────────────────────────────────
    // IMPORTANT: Never use real credentials here.
    // Use environment variables instead:
    //   process.env.TEST_USER_EMAIL
    //   process.env.TEST_USER_PASSWORD
    // ────────────────────────────────────────────────────────────
    const email = process.env.TEST_USER_EMAIL || 'test@example.com';
    const password = process.env.TEST_USER_PASSWORD || 'password123';

    await loginPage.login(email, password);
    await captureEvidence(page, testInfo, 'after-login');

    // Verify redirect after login
    // await expect(page).toHaveURL('/dashboard');
    // await expect(page.locator('h1')).toContainText('Welcome');
  });

  test('Login with invalid credentials shows error', async ({ page }) => {
    const { email } = generateUserData();
    await loginPage.login(email, 'wrong-password');

    // Verify the error message
    // await expect(loginPage.errorMessage).toBeVisible();
    // await expect(loginPage.errorMessage).toContainText('Invalid');

    // Test placeholder
    expect(page.url()).toBeTruthy();
  });
});
