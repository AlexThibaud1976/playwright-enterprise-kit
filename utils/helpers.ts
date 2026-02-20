/**
 * Playwright Enterprise Kit - Utilitaires génériques
 *
 * Fonctions réutilisables indépendantes du projet :
 * - Capture d'evidence (screenshots pour Xray)
 * - Données de test uniques
 * - Helpers d'attente
 * - Assertion d'URL compatible BrowserStack
 */

import { Page, TestInfo, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/** Dossier de stockage des screenshots d'evidence */
export const EVIDENCE_DIR = 'test-results/evidence';

// ── Evidence ────────────────────────────────────────────────────────────────

/**
 * Prend un screenshot et l'attache comme evidence au rapport Playwright / Xray.
 *
 * @param page     - Page Playwright
 * @param testInfo - Info du test en cours
 * @param name     - Nom descriptif du screenshot
 * @returns Chemin du fichier créé
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
  // Préfixe avec test_key si disponible (pour l'intégration Xray)
  const annotation = testInfo.annotations.find(a => a.type === 'test_key');
  const testKey = annotation?.description || 'test';
  const filename = `${testKey}_${sanitizedName}_${timestamp}.png`;
  const filepath = path.join(EVIDENCE_DIR, filename);

  try {
    await page.screenshot({
      path: filepath,
      fullPage: false, // viewport uniquement (évite les timeouts sur BrowserStack)
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
 * Exécute une assertion puis capture un screenshot si elle réussit.
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

// ── Données de test ─────────────────────────────────────────────────────────

/**
 * Génère des données utilisateur uniques basées sur le timestamp.
 * Utile pour éviter les conflits entre runs parallèles.
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
 * Attend un délai fixe en millisecondes.
 * À utiliser avec parcimonie — préférer les assertions Playwright quand possible.
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── URL ─────────────────────────────────────────────────────────────────────

/**
 * Assertion d'URL compatible avec BrowserStack (évite expect(page).toHaveURL
 * qui n'est pas supporté en mode mobile sur BrowserStack).
 *
 * @param page     - Page Playwright
 * @param expected - URL attendue (string ou RegExp)
 * @param timeout  - Timeout en ms (défaut: 10000)
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

// ── Cartes de test ──────────────────────────────────────────────────────────

/**
 * Cartes bancaires de test standard (format Adyen/Stripe test cards).
 * Ces numéros fonctionnent uniquement dans les environnements de test.
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
