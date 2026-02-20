#!/usr/bin/env node

/**
 * Fetch BrowserStack build link by build name and expose it for GitHub Actions.
 * Requires env: BROWSERSTACK_USERNAME, BROWSERSTACK_ACCESS_KEY, BROWSERSTACK_BUILD_NAME.
 */

const https = require('https');

const {
  BROWSERSTACK_USERNAME,
  BROWSERSTACK_ACCESS_KEY,
  BROWSERSTACK_BUILD_NAME,
  GITHUB_OUTPUT
} = process.env;

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!BROWSERSTACK_USERNAME || !BROWSERSTACK_ACCESS_KEY || !BROWSERSTACK_BUILD_NAME) {
  fail('Missing required env vars: BROWSERSTACK_USERNAME, BROWSERSTACK_ACCESS_KEY, BROWSERSTACK_BUILD_NAME');
}

/**
 * Récupère la liste des builds BrowserStack via l'API
 * @returns {Promise} Liste des builds au format JSON
 */
function fetchBuilds() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.browserstack.com',
      path: '/automate/builds.json?limit=50',
      method: 'GET',
      auth: `${BROWSERSTACK_USERNAME}:${BROWSERSTACK_ACCESS_KEY}`
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`BrowserStack API returned ${res.statusCode}: ${data}`));
        }
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

/**
 * Fonction principale: recherche le build BrowserStack correspondant au nom donné
 * et exporte son URL pour GitHub Actions
 */
async function main() {
  console.log('Fetching BrowserStack builds to locate link...');
  const builds = await fetchBuilds();

  const normalize = (s) => (s || '').trim().toLowerCase();
  const target = normalize(BROWSERSTACK_BUILD_NAME);

  // Stratégie de recherche: correspondance exacte > commence par > contient
  const match = builds.find(item => normalize(item?.automation_build?.name) === target)
    || builds.find(item => normalize(item?.automation_build?.name).startsWith(target))
    || builds.find(item => normalize(item?.automation_build?.name).includes(target));

  let buildItem = match;

  if (!buildItem) {
    console.log(`No build found with name (or partial match): ${BROWSERSTACK_BUILD_NAME}`);
    console.log('Falling back to the most recent build. Available build names (latest 5):');
    builds.slice(0, 5).forEach(b => console.log('- ', b?.automation_build?.name));
    buildItem = builds[0];
  }

  if (!buildItem) {
    console.log('No builds returned by BrowserStack API.');
    return;
  }

  const build = buildItem.automation_build;
  const hashedId = build.hashed_id;

  const buildUrl = hashedId
    ? `https://automate.browserstack.com/dashboard/v2/builds/${hashedId}`
    : build.url || '';

  if (!buildUrl) {
    console.log('Build found but no URL returned.');
    return;
  }

  console.log(`BrowserStack build URL: ${buildUrl}`);

  // Export for GitHub Actions
  if (GITHUB_OUTPUT) {
    const fs = require('fs');
    fs.appendFileSync(GITHUB_OUTPUT, `build_url=${buildUrl}\n`);
  }
}

main().catch(err => {
  console.error('Error fetching BrowserStack build link:', err.message);
  process.exit(1);
});