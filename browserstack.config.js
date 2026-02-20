/**
 * Playwright Enterprise Kit - Configuration centralisée BrowserStack
 *
 * Tous les paramètres sont injectés via variables d'environnement.
 * En local, copier .env.browserstack.example → .env.browserstack et renseigner les valeurs.
 * En CI, configurer les secrets GitHub Actions correspondants.
 *
 * Variables d'environnement :
 *   BROWSERSTACK_USERNAME    - Identifiant BrowserStack (obligatoire)
 *   BROWSERSTACK_ACCESS_KEY  - Clé d'accès BrowserStack (obligatoire)
 *   BS_OS                    - Système d'exploitation (ex: Windows, OS X)
 *   BS_OS_VERSION            - Version OS (ex: 11, Monterey, Sonoma)
 *   BS_BROWSER               - Navigateur (ex: chrome, firefox, safari, edge)
 *   BS_BROWSER_VERSION       - Version navigateur (ex: latest, 131)
 *   BS_DEVICE                - Nom du device mobile (laisse vide pour desktop)
 *   BS_WORKERS               - Nombre de workers parallèles (défaut: 5)
 *   BS_RUN_IN_ORDER          - Exécution séquentielle (défaut: true)
 *   BROWSERSTACK_BUILD_NAME  - Nom du build (auto-généré si non défini)
 */

const runInOrder = process.env.BS_RUN_IN_ORDER !== 'false';
const requestedWorkers = parseInt(process.env.BS_WORKERS || '5', 10);
const now = new Date();

const isMobile = Boolean(process.env.BS_DEVICE);

const capabilities = isMobile
  ? {
      // Mobile (ex: iPhone 15 Pro Max, Samsung Galaxy S23)
      device: process.env.BS_DEVICE,
      osVersion: process.env.BS_OS_VERSION || '17',
      browser: process.env.BS_BROWSER || 'safari',
      'browserstack.console': 'info',
      'browserstack.networkLogs': 'true',
      'browserstack.debug': 'true',
      'browserstack.video': 'true',
    }
  : {
      // Desktop
      os: process.env.BS_OS || 'Windows',
      osVersion: process.env.BS_OS_VERSION || '11',
      browser: process.env.BS_BROWSER || 'chrome',
      browserVersion: process.env.BS_BROWSER_VERSION || 'latest',
      'browserstack.console': 'info',
      'browserstack.networkLogs': 'true',
      'browserstack.debug': 'true',
      'browserstack.video': 'true',
    };

module.exports = {
  username: process.env.BROWSERSTACK_USERNAME,
  accessKey: process.env.BROWSERSTACK_ACCESS_KEY,
  runInOrder,
  buildName:
    process.env.BROWSERSTACK_BUILD_NAME ||
    `Enterprise Kit - ${now.toISOString().split('T')[0]} ${now.toTimeString().slice(0, 5)}`,
  // Nom du projet affiché dans le dashboard BrowserStack - à personnaliser
  projectName: process.env.BS_PROJECT_NAME || 'Playwright Enterprise Kit',
  testObservability: true,
  capabilities,
  workers: runInOrder ? 5 : requestedWorkers,
  timeout: 90000,
  retries: 0,
};
