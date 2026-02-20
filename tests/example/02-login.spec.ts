/**
 * Playwright Enterprise Kit - Exemple de test de login avec POM
 *
 * Démontre le pattern Page Object Model (POM) recommandé.
 * Adaptez les sélecteurs à votre application.
 *
 * Structure recommandée pour vos tests :
 *   - Chaque fichier = une fonctionnalité
 *   - Chaque test = un scénario indépendant
 *   - test.beforeEach pour les préconditions communes
 *   - test.afterEach pour le nettoyage
 */

import { test, expect } from '@playwright/test';
import { generateUserData, captureEvidence } from '../../utils/helpers';

// ──────────────────────────────────────────────────────────────────────────────
// EXEMPLE DE PAGE OBJECT INLINE - À extraire dans pages/login.page.ts
// ──────────────────────────────────────────────────────────────────────────────

class LoginPage {
  constructor(private page: import('@playwright/test').Page) {}

  // Sélecteurs — adaptez à votre application
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
    // Vérifier les éléments présents sur la page
    // Décommentez les assertions correspondant à votre application
    //
    // await expect(loginPage.emailInput).toBeVisible();
    // await expect(loginPage.passwordInput).toBeVisible();
    // await expect(loginPage.submitButton).toBeVisible();

    // Capture d'evidence
    await captureEvidence(page, testInfo, 'login-page');

    // Test placeholder : à remplacer par de vraies assertions
    expect(page.url()).toContain('login');
  });

  test('Login with valid credentials', async ({ page }, testInfo) => {
    // ────────────────────────────────────────────────────────────
    // IMPORTANT : N'utilisez jamais de credentials réels ici.
    // Utilisez des variables d'environnement :
    //   process.env.TEST_USER_EMAIL
    //   process.env.TEST_USER_PASSWORD
    // ────────────────────────────────────────────────────────────
    const email = process.env.TEST_USER_EMAIL || 'test@example.com';
    const password = process.env.TEST_USER_PASSWORD || 'password123';

    await loginPage.login(email, password);
    await captureEvidence(page, testInfo, 'after-login');

    // Vérifier la redirection après connexion
    // await expect(page).toHaveURL('/dashboard');
    // await expect(page.locator('h1')).toContainText('Welcome');
  });

  test('Login with invalid credentials shows error', async ({ page }) => {
    const { email } = generateUserData();
    await loginPage.login(email, 'wrong-password');

    // Vérifier le message d'erreur
    // await expect(loginPage.errorMessage).toBeVisible();
    // await expect(loginPage.errorMessage).toContainText('Invalid');

    // Test placeholder
    expect(page.url()).toBeTruthy();
  });
});
