/**
 * Playwright Enterprise Kit - Page Object de base
 *
 * Toutes les Page Objects de votre projet doivent étendre cette classe.
 * Elle fournit les comportements communs : navigation, attente, screenshots.
 *
 * Usage :
 *   import { BasePage } from './base.page';
 *
 *   export class LoginPage extends BasePage {
 *     readonly emailInput = this.page.locator('input[name="email"]');
 *     readonly passwordInput = this.page.locator('input[name="password"]');
 *     readonly submitButton = this.page.locator('button[type="submit"]');
 *
 *     async login(email: string, password: string) {
 *       await this.navigate('/login');
 *       await this.emailInput.fill(email);
 *       await this.passwordInput.fill(password);
 *       await this.submitButton.click();
 *       await this.page.waitForLoadState('networkidle');
 *     }
 *   }
 */

import { Page, Locator, expect } from '@playwright/test';
import { wait } from '../utils/helpers';

export abstract class BasePage {
  constructor(protected readonly page: Page) {}

  /**
   * Navigue vers un chemin relatif ou une URL absolue.
   */
  async navigate(path: string): Promise<void> {
    await this.page.goto(path);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Vérifie que le titre de la page correspond au pattern.
   */
  async expectTitle(pattern: string | RegExp): Promise<void> {
    await expect(this.page).toHaveTitle(pattern);
  }

  /**
   * Vérifie que l'URL courante correspond au pattern.
   */
  async expectUrl(pattern: string | RegExp): Promise<void> {
    await expect(this.page).toHaveURL(pattern);
  }

  /**
   * Attend qu'un élément soit visible.
   */
  async waitForElement(locator: Locator, timeout = 10000): Promise<void> {
    await locator.waitFor({ state: 'visible', timeout });
  }

  /**
   * Prend un screenshot de la page courante.
   * @returns Buffer du screenshot
   */
  async screenshot(options?: { fullPage?: boolean }): Promise<Buffer> {
    return this.page.screenshot({ fullPage: options?.fullPage ?? false });
  }

  /**
   * Attend un délai fixe.
   * @deprecated Préférer les assertions explicites quand possible.
   */
  protected async wait(ms: number): Promise<void> {
    await wait(ms);
  }

  /**
   * Retourne l'URL courante.
   */
  get url(): string {
    return this.page.url();
  }
}
