#!/usr/bin/env node

/**
 * Playwright Enterprise Kit - Confluence report update
 *
 * Appends a row to the historical table of a Confluence page after each
 * test run. Creates the page if it does not yet exist.
 *
 * Required environment variables:
 *   CONFLUENCE_URL          - Base Confluence URL (e.g. https://yourco.atlassian.net/wiki)
 *   CONFLUENCE_USER         - Confluence user email
 *   CONFLUENCE_API_TOKEN    - Atlassian API token
 *   CONFLUENCE_SPACE_KEY    - Space key (e.g. QA)
 *
 * Optional environment variables:
 *   CONFLUENCE_PAGE_TITLE   - Page title (default: "Test Execution Dashboard")
 *   CONFLUENCE_PARENT_PAGE_ID - Parent page ID
 *   JIRA_URL                - Jira URL (for links to Test Executions)
 *   DEVICE_NAME             - Name of the tested device
 *   BS_OS, BS_OS_VERSION    - OS and version
 *   BS_BROWSER, BS_BROWSER_VERSION - Browser and version
 *
 * CLI arguments (passed by the GitHub Actions workflow):
 *   --exec-key <key>        - Jira Test Execution key
 *   --test-result <result>  - Result (PASS/FAIL/UNKNOWN)
 *   --test-scope <scope>    - Test scope
 *   --run-number <n>        - GitHub Actions run number
 *   --run-id <id>           - GitHub Actions run ID
 *   --repository <repo>     - GitHub repo (owner/repo)
 *   --browserstack-url <u>  - BrowserStack build URL (optional)
 *
 * Usage:
 *   node scripts/update-confluence-report.js \
 *     --exec-key "PROJ-123" \
 *     --test-result "PASS" \
 *     --test-scope "All Tests" \
 *     --run-number "42" \
 *     --run-id "12345678" \
 *     --repository "myorg/myrepo"
 */

const https = require('https');
const { URL } = require('url');

// ── CLI argument parsing ────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    parsed[key] = args[i + 1];
  }
  return parsed;
}

const cliArgs = parseArgs();

// ── Configuration ───────────────────────────────────────────────────────────

const config = {
  confluenceUrl: process.env.CONFLUENCE_URL,
  user: process.env.CONFLUENCE_USER,
  apiToken: process.env.CONFLUENCE_API_TOKEN,
  spaceKey: process.env.CONFLUENCE_SPACE_KEY,
  pageTitle: process.env.CONFLUENCE_PAGE_TITLE || 'Test Execution Dashboard',
  parentPageId: process.env.CONFLUENCE_PARENT_PAGE_ID || '',
};

const reportData = {
  date: new Date().toISOString().split('T')[0],
  time: new Date().toISOString().split('T')[1].substring(0, 5),
  execKey: cliArgs.execKey || '',
  testResult: cliArgs.testResult || 'UNKNOWN',
  testScope: cliArgs.testScope || 'All Tests',
  deviceName: process.env.DEVICE_NAME || 'unknown',
  os: process.env.BS_OS || '',
  osVersion: process.env.BS_OS_VERSION || '',
  browser: process.env.BS_BROWSER || '',
  browserVersion: process.env.BS_BROWSER_VERSION || '',
  runNumber: cliArgs.runNumber || '',
  runId: cliArgs.runId || '',
  repository: cliArgs.repository || '',
  browserstackUrl: cliArgs.browserstackUrl || '',
};

// ── Validation ──────────────────────────────────────────────────────────────

function validateConfig() {
  const required = ['confluenceUrl', 'user', 'apiToken', 'spaceKey'];
  const missing = required.filter(k => !config[k]);
  if (missing.length > 0) {
    console.error(`Missing required env vars: ${missing.join(', ')}`);
    console.error('Required: CONFLUENCE_URL, CONFLUENCE_USER, CONFLUENCE_API_TOKEN, CONFLUENCE_SPACE_KEY');
    process.exit(1);
  }

  if (!config.confluenceUrl.includes('/wiki')) {
    console.warn('WARNING: CONFLUENCE_URL does not contain "/wiki".');
    console.warn('For Atlassian Cloud, URL should be: https://yourco.atlassian.net/wiki');
  }
}

// ── HTTP helper ─────────────────────────────────────────────────────────────

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const fullUrl = config.confluenceUrl + path;
    const url = new URL(fullUrl);
    const auth = Buffer.from(`${config.user}:${config.apiToken}`).toString('base64');

    if (!request._debugLogged) {
      console.log(`[Confluence] ${method} ${url.href}`);
      request._debugLogged = true;
    }

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          if (data.includes('<!DOCTYPE html>')) {
            return reject(new Error(
              `Confluence API ${res.statusCode}: Received HTML instead of JSON.\n` +
              `Check that CONFLUENCE_URL points to Confluence (should end with /wiki).\n` +
              `Current URL: ${config.confluenceUrl}`
            ));
          }
          return reject(new Error(`Confluence API ${res.statusCode}: ${data}`));
        }
        try { resolve(data ? JSON.parse(data) : {}); } catch { resolve(data); }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ── Confluence Storage Format builders ──────────────────────────────────────

const MAX_ROWS = 50;

function buildResultBadge(result) {
  if (result === 'PASS') {
    return '<ac:structured-macro ac:name="status"><ac:parameter ac:name="colour">Green</ac:parameter><ac:parameter ac:name="title">PASS</ac:parameter></ac:structured-macro>';
  }
  if (result === 'FAIL') {
    return '<ac:structured-macro ac:name="status"><ac:parameter ac:name="colour">Red</ac:parameter><ac:parameter ac:name="title">FAIL</ac:parameter></ac:structured-macro>';
  }
  return '<ac:structured-macro ac:name="status"><ac:parameter ac:name="colour">Grey</ac:parameter><ac:parameter ac:name="title">UNKNOWN</ac:parameter></ac:structured-macro>';
}

function buildJiraLink(key) {
  if (!key) return '-';
  const jiraUrl = process.env.JIRA_URL || config.confluenceUrl.replace('/wiki', '');
  return `<a href="${jiraUrl}/browse/${key}">${key}</a>`;
}

function buildGitHubActionsLink() {
  if (!reportData.repository || !reportData.runId) return '-';
  const url = `https://github.com/${reportData.repository}/actions/runs/${reportData.runId}`;
  return `<a href="${url}">#${reportData.runNumber}</a>`;
}

function buildBrowserStackLink() {
  if (!reportData.browserstackUrl) return '-';
  return `<a href="${reportData.browserstackUrl}">Build</a>`;
}

function buildNewRow() {
  return [
    `<tr>`,
    `<td>${reportData.date} ${reportData.time}</td>`,
    `<td>${buildResultBadge(reportData.testResult)}</td>`,
    `<td>${reportData.testScope}</td>`,
    `<td>${reportData.os} ${reportData.osVersion}</td>`,
    `<td>${reportData.browser} ${reportData.browserVersion}</td>`,
    `<td>${buildJiraLink(reportData.execKey)}</td>`,
    `<td>${buildGitHubActionsLink()}</td>`,
    `<td>${buildBrowserStackLink()}</td>`,
    `</tr>`,
  ].join('');
}

function buildInitialPageContent(firstRow) {
  return [
    `<h1>Test Execution Dashboard</h1>`,
    `<p><em>Page automatically updated by the CI/CD pipeline.</em></p>`,
    `<hr/>`,
    `<h2>Execution History</h2>`,
    `<p>Up to ${MAX_ROWS} executions are kept (most recent first).</p>`,
    `<!-- CONFLUENCE_CI_TABLE_START -->`,
    `<table>`,
    `<colgroup><col/><col/><col/><col/><col/><col/><col/><col/></colgroup>`,
    `<thead><tr>`,
    `<th>Date</th>`,
    `<th>Result</th>`,
    `<th>Scope</th>`,
    `<th>OS</th>`,
    `<th>Browser</th>`,
    `<th>Jira Test Execution</th>`,
    `<th>GitHub</th>`,
    `<th>BrowserStack</th>`,
    `</tr></thead>`,
    `<tbody>`,
    firstRow,
    `</tbody>`,
    `</table>`,
    `<!-- CONFLUENCE_CI_TABLE_END -->`,
  ].join('\n');
}

function extractExistingRows(htmlContent) {
  const tbodyMatch = htmlContent.match(/<tbody>([\s\S]*?)<\/tbody>/);
  if (!tbodyMatch) return [];
  return tbodyMatch[1].match(/<tr>[\s\S]*?<\/tr>/g) || [];
}

function rebuildPageWithHistory(existingBody, newRow) {
  const existingRows = extractExistingRows(existingBody);
  const allRows = [newRow, ...existingRows].slice(0, MAX_ROWS);
  return buildInitialPageContent(allRows.join('\n'));
}

function insertRowInTable(existingBody, newRow) {
  const startMarker = '<!-- CONFLUENCE_CI_TABLE_START -->';
  const endMarker = '<!-- CONFLUENCE_CI_TABLE_END -->';

  const startIdx = existingBody.indexOf(startMarker);
  const endIdx = existingBody.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1) {
    console.log('Table markers not found, rebuilding page with existing history...');
    return rebuildPageWithHistory(existingBody, newRow);
  }

  const tableSection = existingBody.substring(startIdx, endIdx + endMarker.length);
  const tbodyOpen = '<tbody>';
  const tbodyIdx = tableSection.indexOf(tbodyOpen);

  if (tbodyIdx === -1) {
    return rebuildPageWithHistory(existingBody, newRow);
  }

  const insertPoint = tbodyIdx + tbodyOpen.length;
  let updatedTable = tableSection.substring(0, insertPoint) + '\n' + newRow + tableSection.substring(insertPoint);

  // Enforce max rows
  const tbodyContent = updatedTable.substring(
    updatedTable.indexOf(tbodyOpen) + tbodyOpen.length,
    updatedTable.indexOf('</tbody>')
  );
  const rows = tbodyContent.match(/<tr>[\s\S]*?<\/tr>/g) || [];

  if (rows.length > MAX_ROWS) {
    const keepRows = rows.slice(0, MAX_ROWS);
    updatedTable =
      updatedTable.substring(0, updatedTable.indexOf(tbodyOpen) + tbodyOpen.length) +
      '\n' + keepRows.join('\n') + '\n' +
      updatedTable.substring(updatedTable.indexOf('</tbody>'));
    console.log(`Trimmed from ${rows.length} to ${MAX_ROWS} rows`);
  }

  return existingBody.substring(0, startIdx) + updatedTable + existingBody.substring(endIdx + endMarker.length);
}

// ── Confluence API operations ───────────────────────────────────────────────

async function findPage() {
  const title = encodeURIComponent(config.pageTitle);
  const spaceKey = encodeURIComponent(config.spaceKey);
  const result = await request('GET', `/rest/api/content?title=${title}&spaceKey=${spaceKey}&expand=body.storage,version`);
  return (result.results && result.results.length > 0) ? result.results[0] : null;
}

async function createPage(content) {
  const body = {
    type: 'page',
    title: config.pageTitle,
    space: { key: config.spaceKey },
    body: { storage: { value: content, representation: 'storage' } },
  };
  if (config.parentPageId) {
    body.ancestors = [{ id: config.parentPageId }];
  }
  return request('POST', '/rest/api/content', body);
}

async function updatePage(pageId, currentVersion, newContent) {
  return request('PUT', `/rest/api/content/${pageId}`, {
    id: pageId,
    type: 'page',
    title: config.pageTitle,
    space: { key: config.spaceKey },
    version: { number: currentVersion + 1 },
    body: { storage: { value: newContent, representation: 'storage' } },
  });
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  validateConfig();

  console.log('==============================================');
  console.log('[Confluence Report] Starting');
  console.log(`  Space : ${config.spaceKey}`);
  console.log(`  Page  : ${config.pageTitle}`);
  console.log(`  Result: ${reportData.testResult}`);
  console.log(`  Scope : ${reportData.testScope}`);
  console.log('==============================================');

  const newRow = buildNewRow();
  let page = await findPage();

  if (page) {
    console.log(`Page found (id: ${page.id}, v${page.version.number}), updating...`);
    const updatedContent = insertRowInTable(page.body.storage.value, newRow);
    await updatePage(page.id, page.version.number, updatedContent);
    console.log(`Page updated to v${page.version.number + 1}`);
  } else {
    console.log('Page not found, creating...');
    page = await createPage(buildInitialPageContent(newRow));
    console.log(`Page created (id: ${page.id})`);
  }

  const pageUrl = `${config.confluenceUrl}/spaces/${config.spaceKey}/pages/${page.id}`;
  console.log('==============================================');
  console.log('[Confluence Report] Done');
  console.log(`  View: ${pageUrl}`);
  console.log('==============================================');
}

main().catch(err => {
  console.error('[Confluence Report] Error:', err.message);
  process.exit(1);
});
