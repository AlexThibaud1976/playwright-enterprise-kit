/**
 * Playwright Enterprise Kit - Test de sanité
 *
 * Ce test vérifie que le framework est correctement configuré.
 * Remplacez BASE_URL et les assertions par votre application cible.
 *
 * Pour lier ce test à un test Jira/Xray, décommentez et renseignez :
 *   test.info().annotations.push({ type: 'test_key', value: 'PROJ-42' });
 */

import { test, expect } from '@playwright/test';
import { captureEvidence } from '../../utils/helpers';

test.describe('Sanity - Framework health check', () => {
  test('Homepage loads successfully', async ({ page }, testInfo) => {
    // ──────────────────────────────────────────────────────────────────────
    // Remplacez l'URL ci-dessous par votre application cible.
    // En production, utilisez BASE_URL via la variable d'environnement :
    //   baseURL est configuré dans playwright.config.ts → process.env.BASE_URL
    // ──────────────────────────────────────────────────────────────────────
    await page.goto('/');

    // Vérification basique : le titre de la page doit être non vide
    const title = await page.title();
    expect(title).toBeTruthy();
    console.log(`Page title: ${title}`);

    // Capture d'evidence (optionnel, pour les rapports Xray)
    await captureEvidence(page, testInfo, 'homepage-loaded');
  });

  test('Page responds within timeout', async ({ page }) => {
    const start = Date.now();
    await page.goto('/');
    const duration = Date.now() - start;

    // La page doit charger en moins de 30 secondes
    expect(duration).toBeLessThan(30000);
    console.log(`Page load time: ${duration}ms`);
  });
});
