#!/usr/bin/env node
/**
 * Resolves and validates the BrowserStack configuration from input parameters
 * with dynamic validation via the BrowserStack API
 *
 * Usage:
 *   node scripts/resolve-browserstack-config.js \
 *     --os Windows \
 *     --osVersion 11 \
 *     --browser chrome \
 *     --browserVersion latest
 *
 * Environment variables set:
 *   - BS_OS (e.g. Windows, OS X)
 *   - BS_OS_VERSION (e.g. 10, 11, 14, 15)
 *   - BS_BROWSER (e.g. chrome, firefox, safari, edge)
 *   - BS_BROWSER_VERSION (e.g. latest, 120, 119, etc)
 *   - DEVICE_NAME (e.g. win11-chrome-latest)
 *
 * Required environment variables for API validation:
 *   - BROWSERSTACK_USERNAME
 *   - BROWSERSTACK_ACCESS_KEY
 */

const fs = require('fs');

// Local fallback cache - used if the BrowserStack API is unreachable
// Last updated January 27, 2026 - Playwright versions available on BrowserStack
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

// Static mappings for BrowserStack
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
 * Fetches available capabilities from the BrowserStack API
 * @returns {Promise<Array|null>} List of capabilities or null on error
 */
async function fetchBrowserStackCapabilities() {
  const username = process.env.BROWSERSTACK_USERNAME;
  const accessKey = process.env.BROWSERSTACK_ACCESS_KEY;

  if (!username || !accessKey) {
    console.warn('⚠️  BrowserStack credentials not set, using local fallback cache');
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
      console.warn(`⚠️  BrowserStack API: ${response.status} ${response.statusText}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeout);
    if (error.name === 'AbortError') {
      console.warn('⚠️  BrowserStack API: timed out after 10 seconds');
    } else {
      console.warn(`⚠️  BrowserStack API unreachable: ${error.message}`);
    }
    console.warn('   → Using local fallback cache');
    return null;
  }
}

/**
 * Extracts available versions from the BrowserStack API response
 * @param {Array} capabilities - BrowserStack API response
 * @param {string} osKey - OS key (windows, mac)
 * @param {string} browserKey - Browser key (chrome, firefox, etc.)
 * @returns {Object} Available OS and browser versions
 */
function extractAvailableVersions(capabilities, osKey, browserKey) {
  const osLabel = BROWSERSTACK_MAPPINGS.os[osKey].label;

  // Filter desktop combinations (device === null)
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

// Parse command-line arguments
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
 * Validates parameters with BrowserStack API support and local fallback
 * @param {Object} params - Parameters to validate
 * @returns {Promise<Array>} List of errors (empty if all valid)
 */
async function validateParams(params) {
  const errors = [];
  const osKey = params.os?.toLowerCase();
  const browserKey = params.browser?.toLowerCase();

  // OS validation (static - fixed list)
  if (!params.os) {
    errors.push('--os is required (Windows or Mac)');
    return errors;
  }

  if (!osKey || !BROWSERSTACK_MAPPINGS.os[osKey]) {
    errors.push(
      `Invalid OS: '${params.os}'. Accepted values: ${Object.keys(BROWSERSTACK_MAPPINGS.os).join(', ')}`
    );
    return errors;
  }

  // Browser validation (static - fixed list)
  if (!params.browser) {
    errors.push('--browser is required (chrome, firefox, safari, edge)');
    return errors;
  }

  if (!browserKey || !BROWSERSTACK_MAPPINGS.browsers[browserKey]) {
    errors.push(
      `Invalid browser: '${params.browser}'. Accepted values: ${Object.keys(BROWSERSTACK_MAPPINGS.browsers).join(', ')}`
    );
    return errors;
  }

  // osVersion validation required
  if (!params.osVersion) {
    errors.push(`--osVersion is required for ${params.os}`);
    return errors;
  }

  // browserVersion validation required
  if (!params.browserVersion) {
    errors.push(`--browserVersion is required for ${params.browser}`);
    return errors;
  }

  // Accept "latest", "latest-1", "latest-2", etc. patterns without API validation
  const isLatestPattern = /^latest(-\d+)?$/.test(params.browserVersion);

  // Retrieve available versions from the API or fallback cache
  const capabilities = await fetchBrowserStackCapabilities();

  let availableOsVersions, availableBrowserVersions;

  if (capabilities) {
    console.log('✅ Versions retrieved from BrowserStack API');
    const extracted = extractAvailableVersions(capabilities, osKey, browserKey);
    availableOsVersions = extracted.osVersions;
    availableBrowserVersions = extracted.browserVersions;
  } else {
    // Fallback to local cache
    availableOsVersions = FALLBACK_VERSIONS.os[osKey] || [];
    availableBrowserVersions = FALLBACK_VERSIONS.browsers[browserKey] || [];
  }

  // OS version validation
  if (!availableOsVersions.includes(params.osVersion)) {
    const versionsDisplay =
      availableOsVersions.length > 10
        ? availableOsVersions.slice(0, 10).join(', ') + '...'
        : availableOsVersions.join(', ');
    errors.push(
      `OS version '${params.osVersion}' not available for ${params.os}.\n   Available versions: ${versionsDisplay}`
    );
  }

  // Browser version validation (unless "latest" pattern)
  if (!isLatestPattern && !availableBrowserVersions.includes(params.browserVersion)) {
    const versionsDisplay =
      availableBrowserVersions.length > 10
        ? availableBrowserVersions.slice(0, 10).join(', ') + '...'
        : availableBrowserVersions.join(', ');
    errors.push(
      `Browser version '${params.browserVersion}' not available for ${params.browser}.\n   Available versions: ${versionsDisplay}`
    );
  }

  return errors;
}

/**
 * Resolves and builds the BrowserStack configuration from validated parameters
 * @param {Object} params - Configuration parameters (os, osVersion, browser, browserVersion)
 * @returns {Object} Resolved configuration with environment variables
 */
function resolveConfig(params) {
  const osKey = params.os.toLowerCase();
  const browserKey = params.browser.toLowerCase();

  const osLabel = BROWSERSTACK_MAPPINGS.os[osKey].label;
  const browserInfo = BROWSERSTACK_MAPPINGS.browsers[browserKey];

  // Use the BrowserStack browser name (e.g. playwright-firefox)
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
 * Exports the configuration as environment variables
 * In GitHub Actions mode: writes to GITHUB_ENV
 * In local mode: prints variables to the console
 * @param {Object} config - Configuration to export
 * @returns {Object} Exported configuration
 */
function exportForGitHub(config) {
  const gitHubEnv = process.env.GITHUB_ENV;

  if (gitHubEnv) {
    // GitHub Actions mode: write to GITHUB_ENV for persistence across steps
    const envContent = Object.entries(config)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    fs.appendFileSync(gitHubEnv, envContent + '\n');
    console.log('✅ Environment variables exported to GITHUB_ENV');
  } else {
    // Local development: print the variables
    console.log('\n📋 Resolved BrowserStack configuration:');
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
    console.error('❌ Validation error:\n');
    errors.forEach((error) => console.error(`   • ${error}`));
    console.error('\n📖 Usage:');
    console.error('   node scripts/resolve-browserstack-config.js \\');
    console.error('     --os <os> \\');
    console.error('     --osVersion <version> \\');
    console.error('     --browser <browser> \\');
    console.error('     --browserVersion <version>');
    console.error('\n💡 Examples:');
    console.error(
      '   node scripts/resolve-browserstack-config.js --os Windows --osVersion 11 --browser chrome --browserVersion latest'
    );
    console.error(
      '   node scripts/resolve-browserstack-config.js --os Mac --osVersion Sonoma --browser safari --browserVersion 18'
    );
    console.error('\n📝 Notes:');
    console.error('   • OS/browser versions are validated dynamically via the BrowserStack API');
    console.error('   • Use "latest", "latest-1", "latest-2" for recent versions');
    console.error('   • A local cache is used when the API is unreachable');
    process.exit(1);
  }

  const config = resolveConfig(params);
  exportForGitHub(config);

  // Return config as JSON for parsing
  console.log(JSON.stringify(config));
  process.exit(0);
}

main();
