#!/usr/bin/env node
/**
 * Résout et valide la configuration BrowserStack à partir des paramètres d'entrée
 * avec validation dynamique via l'API BrowserStack
 *
 * Usage:
 *   node scripts/resolve-browserstack-config.js \
 *     --os Windows \
 *     --osVersion 11 \
 *     --browser chrome \
 *     --browserVersion latest
 *
 * Variables d'environnement définies:
 *   - BS_OS (ex: Windows, OS X)
 *   - BS_OS_VERSION (ex: 10, 11, 14, 15)
 *   - BS_BROWSER (ex: chrome, firefox, safari, edge)
 *   - BS_BROWSER_VERSION (ex: latest, 120, 119, etc)
 *   - DEVICE_NAME (ex: win11-chrome-latest)
 *
 * Variables d'environnement requises pour la validation API:
 *   - BROWSERSTACK_USERNAME
 *   - BROWSERSTACK_ACCESS_KEY
 */

const fs = require('fs');

// Cache local de secours - utilisé si l'API BrowserStack est inaccessible
// Mis à jour le 27 janvier 2026 - versions Playwright disponibles sur BrowserStack
const FALLBACK_VERSIONS = {
  os: {
    windows: ['7', '8', '8.1', '10', '11'],
    mac: ['Catalina', 'Big Sur', 'Monterey', 'Ventura', 'Sonoma', 'Sequoia', 'Tahoe'],
  },
  browsers: {
    chrome: ['latest', 'latest-1', 'latest-2', '131', '130', '129', '128'],
    chromium: ['latest', 'latest-1', 'latest-2', '131', '130', '129', '128'],
    firefox: ['latest', 'latest-1', 'latest-2', '133', '132', '131', '130'],
    safari: ['latest', '18', '17', '16', '15'],
    edge: ['latest', 'latest-1', 'latest-2', '131', '130', '129', '128'],
  },
};

// Mappings statiques pour BrowserStack
const BROWSERSTACK_MAPPINGS = {
  os: {
    windows: { label: 'Windows' },
    mac: { label: 'OS X' },
  },
  browsers: {
    chrome: {
      displayName: 'Chrome',
      browserName: 'playwright-chromium',
    },
    chromium: {
      displayName: 'Chromium',
      browserName: 'playwright-chromium',
    },
    firefox: {
      displayName: 'Firefox',
      browserName: 'playwright-firefox',
    },
    safari: {
      displayName: 'Safari',
      browserName: 'playwright-webkit',
    },
    edge: {
      displayName: 'Edge',
      browserName: 'playwright-chromium',
    },
  },
};

/**
 * Récupère les capabilities disponibles depuis l'API BrowserStack
 * @returns {Promise<Array|null>} Liste des capabilities ou null si erreur
 */
async function fetchBrowserStackCapabilities() {
  const username = process.env.BROWSERSTACK_USERNAME;
  const accessKey = process.env.BROWSERSTACK_ACCESS_KEY;

  if (!username || !accessKey) {
    console.warn('⚠️  Credentials BrowserStack non définis, utilisation du cache local');
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch('https://api.browserstack.com/automate/browsers.json', {
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${username}:${accessKey}`).toString('base64'),
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`⚠️  API BrowserStack: ${response.status} ${response.statusText}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      console.warn('⚠️  API BrowserStack: timeout après 10 secondes');
    } else {
      console.warn(`⚠️  API BrowserStack inaccessible: ${error.message}`);
    }
    console.warn('   → Utilisation du cache local de secours');
    return null;
  }
}

/**
 * Extrait les versions disponibles depuis la réponse API BrowserStack
 * @param {Array} capabilities - Réponse de l'API BrowserStack
 * @param {string} osKey - Clé de l'OS (windows, mac)
 * @param {string} browserKey - Clé du navigateur (chrome, firefox, etc.)
 * @returns {Object} Versions OS et navigateur disponibles
 */
function extractAvailableVersions(capabilities, osKey, browserKey) {
  const osLabel = BROWSERSTACK_MAPPINGS.os[osKey].label;

  // Filtrer les combinaisons desktop (device === null)
  const osVersions = [
    ...new Set(
      capabilities
        .filter((c) => c.os === osLabel && c.device === null)
        .map((c) => c.os_version)
    ),
  ];

  const browserVersions = [
    ...new Set(
      capabilities
        .filter((c) => c.browser === browserKey && c.device === null)
        .map((c) => c.browser_version)
    ),
  ];

  return { osVersions, browserVersions };
}

// Parse les arguments de ligne de commande
function parseArguments() {
  const args = process.argv.slice(2);
  const params = {
    os: null,
    osVersion: null,
    browser: null,
    browserVersion: null,
  };

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    const value = args[i + 1];

    if (key in params) {
      params[key] = value;
    }
  }

  return params;
}

/**
 * Valide les paramètres avec support de l'API BrowserStack et fallback local
 * @param {Object} params - Paramètres à valider
 * @returns {Promise<Array>} Liste des erreurs (vide si tout est valide)
 */
async function validateParams(params) {
  const errors = [];
  const osKey = params.os?.toLowerCase();
  const browserKey = params.browser?.toLowerCase();

  // Validation OS (statique - liste fixe)
  if (!params.os) {
    errors.push('--os est requis (Windows ou Mac)');
    return errors;
  }

  if (!osKey || !BROWSERSTACK_MAPPINGS.os[osKey]) {
    errors.push(
      `OS invalide: '${params.os}'. Valeurs acceptées: ${Object.keys(BROWSERSTACK_MAPPINGS.os).join(', ')}`
    );
    return errors;
  }

  // Validation browser (statique - liste fixe)
  if (!params.browser) {
    errors.push('--browser est requis (chrome, firefox, safari, edge)');
    return errors;
  }

  if (!browserKey || !BROWSERSTACK_MAPPINGS.browsers[browserKey]) {
    errors.push(
      `Navigateur invalide: '${params.browser}'. Valeurs acceptées: ${Object.keys(BROWSERSTACK_MAPPINGS.browsers).join(', ')}`
    );
    return errors;
  }

  // Validation osVersion requise
  if (!params.osVersion) {
    errors.push(`--osVersion est requis pour ${params.os}`);
    return errors;
  }

  // Validation browserVersion requise
  if (!params.browserVersion) {
    errors.push(`--browserVersion est requis pour ${params.browser}`);
    return errors;
  }

  // Accepter les patterns "latest", "latest-1", "latest-2", etc. sans validation API
  const isLatestPattern = /^latest(-\d+)?$/.test(params.browserVersion);

  // Récupérer les versions disponibles depuis l'API ou le cache
  const capabilities = await fetchBrowserStackCapabilities();

  let availableOsVersions, availableBrowserVersions;

  if (capabilities) {
    console.log('✅ Versions récupérées depuis l\'API BrowserStack');
    const extracted = extractAvailableVersions(capabilities, osKey, browserKey);
    availableOsVersions = extracted.osVersions;
    availableBrowserVersions = extracted.browserVersions;
  } else {
    // Fallback vers le cache local
    availableOsVersions = FALLBACK_VERSIONS.os[osKey] || [];
    availableBrowserVersions = FALLBACK_VERSIONS.browsers[browserKey] || [];
  }

  // Validation version OS
  if (!availableOsVersions.includes(params.osVersion)) {
    const versionsDisplay =
      availableOsVersions.length > 10
        ? availableOsVersions.slice(0, 10).join(', ') + '...'
        : availableOsVersions.join(', ');
    errors.push(
      `Version OS '${params.osVersion}' non disponible pour ${params.os}.\n   Versions disponibles: ${versionsDisplay}`
    );
  }

  // Validation version browser (sauf si pattern "latest")
  if (!isLatestPattern && !availableBrowserVersions.includes(params.browserVersion)) {
    const versionsDisplay =
      availableBrowserVersions.length > 10
        ? availableBrowserVersions.slice(0, 10).join(', ') + '...'
        : availableBrowserVersions.join(', ');
    errors.push(
      `Version navigateur '${params.browserVersion}' non disponible pour ${params.browser}.\n   Versions disponibles: ${versionsDisplay}`
    );
  }

  return errors;
}

/**
 * Résout et construit la configuration BrowserStack à partir des paramètres validés
 * @param {Object} params - Paramètres de configuration (os, osVersion, browser, browserVersion)
 * @returns {Object} Configuration résolue avec variables d'environnement
 */
function resolveConfig(params) {
  const osKey = params.os.toLowerCase();
  const browserKey = params.browser.toLowerCase();

  const osLabel = BROWSERSTACK_MAPPINGS.os[osKey].label;
  const browserInfo = BROWSERSTACK_MAPPINGS.browsers[browserKey];

  // Utiliser le nom de navigateur BrowserStack (ex: playwright-firefox)
  const browserName = browserInfo.browserName;

  const config = {
    BS_OS: osLabel,
    BS_OS_VERSION: params.osVersion,
    BS_BROWSER: browserName,
    BS_BROWSER_VERSION: params.browserVersion,
    DEVICE_NAME: `${osKey}-${params.osVersion.replace(/\s+/g, '')}-${browserKey}-${params.browserVersion}`.toLowerCase(),
  };

  return config;
}

/**
 * Exporte la configuration en tant que variables d'environnement
 * En mode GitHub Actions: écrit dans GITHUB_ENV
 * En mode local: affiche les variables dans la console
 * @param {Object} config - Configuration à exporter
 * @returns {Object} Configuration exportée
 */
function exportForGitHub(config) {
  const gitHubEnv = process.env.GITHUB_ENV;

  if (gitHubEnv) {
    // Mode GitHub Actions: écrire dans GITHUB_ENV pour persistance entre les steps
    const envContent = Object.entries(config)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    fs.appendFileSync(gitHubEnv, envContent + '\n');
    console.log('✅ Variables d\'environnement exportées vers GITHUB_ENV');
  } else {
    // Développement local: afficher les variables
    console.log('\n📋 Configuration BrowserStack résolue:');
    Object.entries(config).forEach(([key, value]) => {
      console.log(`   ${key}=${value}`);
    });
  }

  return config;
}

// Main (async)
async function main() {
  const params = parseArguments();

  const errors = await validateParams(params);
  if (errors.length > 0) {
    console.error('❌ Erreur de validation:\n');
    errors.forEach((error) => console.error(`   • ${error}`));
    console.error('\n📖 Usage:');
    console.error('   node scripts/resolve-browserstack-config.js \\');
    console.error('     --os <os> \\');
    console.error('     --osVersion <version> \\');
    console.error('     --browser <browser> \\');
    console.error('     --browserVersion <version>');
    console.error('\n💡 Exemples:');
    console.error(
      '   node scripts/resolve-browserstack-config.js --os Windows --osVersion 11 --browser chrome --browserVersion latest'
    );
    console.error(
      '   node scripts/resolve-browserstack-config.js --os Mac --osVersion Sonoma --browser safari --browserVersion 18'
    );
    console.error('\n📝 Notes:');
    console.error('   • Les versions OS/navigateur sont validées dynamiquement via l\'API BrowserStack');
    console.error('   • Utilisez "latest", "latest-1", "latest-2" pour les versions récentes');
    console.error('   • Un cache local est utilisé si l\'API est inaccessible');
    process.exit(1);
  }

  const config = resolveConfig(params);
  exportForGitHub(config);

  // Retourner la config en JSON pour parsing
  console.log(JSON.stringify(config));
  process.exit(0);
}

main();
