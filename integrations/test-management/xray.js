/**
 * Test management: Xray Cloud (Jira).
 *
 * Node port of the historical flow, for local / MCP / non-GitHub CI usage:
 *   1. scripts/add-timestamps-to-xray-report.js  (timestamps + evidence)
 *   2. scripts/remove-test-keys.js               (orphan test_key cleanup)
 *   3. POST /api/v2/authenticate + /api/v2/import/execution/junit
 *   4. optional Jira enrichment (title, labels, custom fields, remote links,
 *      HTML report attachment) - same steps as scripts/jira-post-execution.ps1
 *
 * The GitHub Actions workflow keeps using upload-xray.ps1 / jira-post-execution.ps1
 * unchanged; this provider is the cross-platform equivalent.
 *
 * Docs: https://docs.getxray.app/display/XRAYCLOUD/Import+Execution+Results+-+REST+v2
 */
const fs = require('fs');
const path = require('path');
const { request, basicAuth } = require('../lib/http');

async function authenticate(endpoint, env, doFetch) {
  const token = await request(`https://${endpoint}/api/v2/authenticate`, {
    method: 'POST',
    json: { client_id: env.XRAY_CLIENT_ID, client_secret: env.XRAY_CLIENT_SECRET },
    fetch: doFetch,
  });
  return String(token).trim().replace(/^"|"$/g, '');
}

async function enrichJira(key, run, ctx) {
  const { env, log } = ctx;
  const jiraUrl = env.JIRA_URL.replace(/\/$/, '');
  const headers = { Authorization: basicAuth(env.JIRA_USER, env.JIRA_API_TOKEN) };
  const issueUrl = `${jiraUrl}/rest/api/3/issue/${encodeURIComponent(key)}`;
  const device = run.environment.deviceName || 'local';
  const step = async (label, fn) => {
    try {
      await fn();
      log(`  Jira: ${label} ok`);
    } catch (e) {
      log(`  Jira: ${label} failed (non-blocking): ${e.message}`);
    }
  };

  const fields = {};
  const cf = {
    JIRA_CUSTOM_FIELD_OS: run.environment.os,
    JIRA_CUSTOM_FIELD_OS_VERSION: run.environment.osVersion,
    JIRA_CUSTOM_FIELD_BROWSER: run.environment.browser,
    JIRA_CUSTOM_FIELD_BROWSER_VERSION: run.environment.browserVersion,
    JIRA_CUSTOM_FIELD_TEST_SCOPE: run.scope,
  };
  for (const [envKey, value] of Object.entries(cf)) if (env[envKey] && value) fields[env[envKey]] = value;
  if (Object.keys(fields).length) {
    await step('custom fields', () => request(issueUrl, { method: 'PUT', headers, json: { fields }, fetch: ctx.fetch }));
  }

  await step('title + labels', async () => {
    const issue = await request(`${issueUrl}?fields=labels`, { headers, fetch: ctx.fetch });
    const labels = (issue.fields?.labels || []).filter((l) => l !== 'PASS' && l !== 'FAIL');
    labels.push(device.replace(/\s+/g, '-'), run.status);
    await request(issueUrl, {
      method: 'PUT',
      headers,
      json: { fields: { summary: `[${run.status}] Test Execution - ${run.scope} - ${device}`, labels: [...new Set(labels)] } },
      fetch: ctx.fetch,
    });
  });

  for (const link of run.links) {
    await step(`remote link ${link.label}`, () =>
      request(`${issueUrl}/remotelink`, {
        method: 'POST',
        headers,
        json: { object: { url: link.url, title: link.label } },
        fetch: ctx.fetch,
      })
    );
  }

  const html = run.artifacts.html && path.join(run.artifacts.html, 'index.html');
  if (html && fs.existsSync(html) && env.PEK_XRAY_ATTACH_REPORT !== 'false') {
    await step('HTML report attachment', () => {
      const form = new FormData();
      form.append('file', new Blob([fs.readFileSync(html)], { type: 'text/html' }), 'index.html');
      return request(`${issueUrl}/attachments`, {
        method: 'POST',
        headers: { ...headers, 'X-Atlassian-Token': 'no-check' },
        body: form,
        timeoutMs: 120_000,
        fetch: ctx.fetch,
      });
    });
  }
}

module.exports = {
  kind: 'test-management',
  name: 'xray',
  label: 'Xray Cloud (Jira)',
  description: 'Creates a Jira Test Execution from the JUnit report, optionally linked to a Test Plan.',
  docs: 'https://docs.getxray.app/display/XRAYCLOUD/Import+Execution+Results+-+REST+v2',
  env: {
    required: ['XRAY_CLIENT_ID', 'XRAY_CLIENT_SECRET', 'JIRA_PROJECT_KEY'],
    optional: [
      'XRAY_ENDPOINT',
      'XRAY_TEST_PLAN_KEY',
      'JIRA_URL',
      'JIRA_USER',
      'JIRA_API_TOKEN',
      'JIRA_CUSTOM_FIELD_OS',
      'JIRA_CUSTOM_FIELD_OS_VERSION',
      'JIRA_CUSTOM_FIELD_BROWSER',
      'JIRA_CUSTOM_FIELD_BROWSER_VERSION',
      'JIRA_CUSTOM_FIELD_TEST_SCOPE',
      'PEK_XRAY_ATTACH_REPORT',
    ],
  },

  async publish(run, ctx) {
    const { env, log } = ctx;
    const junit = run.artifacts.junit;
    if (!junit) throw new Error('JUnit report (xray-report.xml) not found - Xray needs it.');

    await ctx.runNodeScript('scripts/add-timestamps-to-xray-report.js', [junit]);
    await ctx.runNodeScript('scripts/remove-test-keys.js', [junit]);

    const endpoint = env.XRAY_ENDPOINT || 'xray.cloud.getxray.app';
    const testPlanKey = ctx.options.testPlanKey || env.XRAY_TEST_PLAN_KEY || '';
    const token = await authenticate(endpoint, env, ctx.fetch);

    const qs = new URLSearchParams({ projectKey: env.JIRA_PROJECT_KEY });
    if (testPlanKey) qs.set('testPlanKey', testPlanKey);
    const result = await request(`https://${endpoint}/api/v2/import/execution/junit?${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml', Authorization: `Bearer ${token}` },
      body: fs.readFileSync(junit, 'utf8'),
      timeoutMs: 120_000,
      fetch: ctx.fetch,
    });

    const key = result && result.key;
    if (!key) throw new Error(`Xray import succeeded but returned no key: ${JSON.stringify(result).slice(0, 300)}`);
    log(`  Test Execution created: ${key}${testPlanKey ? ` (Test Plan ${testPlanKey})` : ''}`);

    const url = env.JIRA_URL ? `${env.JIRA_URL.replace(/\/$/, '')}/browse/${key}` : null;
    if (env.JIRA_URL && env.JIRA_USER && env.JIRA_API_TOKEN) await enrichJira(key, run, ctx);
    else log('  Jira enrichment skipped (JIRA_URL / JIRA_USER / JIRA_API_TOKEN not all set)');

    return { key, url, links: url ? [{ kind: 'test-management', label: `Xray ${key}`, url }] : [] };
  },
};
