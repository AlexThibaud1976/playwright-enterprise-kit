import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Enterprise Kit - Configuration principale
 *
 * Variables d'environnement disponibles :
 *   BASE_URL       - URL de l'application à tester (obligatoire en prod)
 *   HEADLESS       - Mode headless (true/false, défaut: true en CI)
 *   TEST_TIMEOUT   - Timeout global des tests en ms (défaut: 60000)
 *   CI             - Détecté automatiquement par GitHub Actions
 */
export default defineConfig({
  testDir: './tests',

  /* Ordre d'exécution */
  testOrder: 'file',

  /* Désactiver le parallélisme par défaut (activer selon besoins) */
  fullyParallel: false,

  /* Interdire les .only() en CI */
  forbidOnly: !!process.env.CI,

  /* Retries automatiques en CI */
  retries: process.env.CI ? 2 : 0,

  /* Nombre de workers */
  workers: process.env.CI ? 4 : 2,

  /* Reporters */
  reporter: [
    ['html'],
    ['list'],
    ['@xray-app/playwright-junit-reporter', {
      outputFile: 'xray-report.xml',
      embedAnnotationsAsProperties: true,
      embedTestrunAnnotationsAsItemProperties: true,
      embedAttachmentsAsProperty: 'testrun_evidence',
      textContentAnnotations: ['test_description', 'testrun_comment'],
      // Exclure les test_key pour éviter les erreurs si les tests ne sont pas encore dans Jira
      annotationsToExclude: ['test_key'],
    }],
    // Résumé visuel GitHub Actions (activé automatiquement en CI)
    ...(process.env.GITHUB_ACTIONS
      ? [['@estruyf/github-actions-reporter', {
          title: 'Playwright Test Results',
          useDetails: true,
          showError: true,
          showTags: true,
        }] as const]
      : []),
  ],

  use: {
    /* URL de base - configurable via variable d'environnement */
    baseURL: process.env.BASE_URL || 'http://localhost:3000',

    /* Traces, screenshots, vidéos */
    trace: 'on-first-retry',
    screenshot: {
      mode: 'only-on-failure',
      fullPage: true,
    },
    video: 'retain-on-failure',

    /* Mode headless */
    headless: process.env.HEADLESS !== 'false',
  },

  /* Timeouts */
  timeout: Number(process.env.TEST_TIMEOUT) || 60000,
  expect: {
    timeout: 10000,
  },

  /* Projets (navigateurs) */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
