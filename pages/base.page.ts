/**
 * Playwright Enterprise Kit - Base Page Object
 *
 * All Page Objects in your project should extend this class.
 * It provides common behaviours: navigation, waiting, screenshots.
 *
 * Usage:
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
   * Navigates to a relative path or absolute URL.
   */
  async navigate(path: string): Promise<void> {
    await this.page.goto(path);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Asserts that the page title matches the given pattern.
   */
  async expectTitle(pattern: string | RegExp): Promise<void> {
    await expect(this.page).toHaveTitle(pattern);
  }

  /**
   * Asserts that the current URL matches the given pattern.
   */
  async expectUrl(pattern: string | RegExp): Promise<void> {
    await expect(this.page).toHaveURL(pattern);
  }

  /**
   * Waits for an element to become visible.
   */
  async waitForElement(locator: Locator, timeout = 10000): Promise<void> {
    await locator.waitFor({ state: 'visible', timeout });
  }

  /**
   * Takes a screenshot of the current page.
   * @returns Screenshot buffer
   */
  async screenshot(options?: { fullPage?: boolean }): Promise<Buffer> {
    return this.page.screenshot({ fullPage: options?.fullPage ?? false });
  }

  /**
   * Waits for a fixed delay.
   * @deprecated Prefer explicit assertions whenever possible.
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
