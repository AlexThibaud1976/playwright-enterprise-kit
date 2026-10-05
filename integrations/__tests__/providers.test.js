const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { fromJUnit, computeStats, computeStatus } = require('../lib/run-result');
const { publish } = require('../lib/publish');

const DIR = __dirname;

function sampleRun(extra = {}) {
  const parsed = fromJUnit(fs.readFileSync(path.join(DIR, 'fixture-junit.xml'), 'utf8'));
  const stats = computeStats(parsed.tests, parsed.durationMs);
  return {
    schemaVersion: 1,
    status: computeStatus(stats),
    scope: 'Login',
    stats,
    environment: { grid: 'local', deviceName: 'local', projects: [] },
    ci: null,
    tests: parsed.tests,
    links: [{ kind: 'ci', label: 'CI run #3', url: 'https://ci/3' }],
    testManagement: {},
    artifacts: { junit: path.join(DIR, 'fixture-junit.xml'), json: null, html: null },
    ...extra,
  };
}

/** Records calls and answers from a route table: [method, urlRegex, responseBody] */
function mockFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', headers: init.headers || {}, body: init.body });
    const route = routes.find(([m, re]) => m === (init.method || 'GET') && re.test(url));
    if (!route) return new Response('not found', { status: 404 });
    return new Response(typeof route[2] === 'string' ? route[2] : JSON.stringify(route[2]), { status: 200 });
  };
  fn.calls = calls;
  return fn;
}

const ctx = (env, fetch) => ({ env, fetch, log: () => {}, options: {}, rootDir: DIR, runNodeScript: async () => '' });

test('slack: header + failed tests + links, honours SLACK_NOTIFY_ON', async () => {
  const slack = require('../publishers/slack');
  const fetch = mockFetch([['POST', /hooks/, 'ok']]);
  await slack.publish(sampleRun(), ctx({ SLACK_WEBHOOK_URL: 'https://hooks.slack.com/services/x' }, fetch));
  const payload = JSON.parse(fetch.calls[0].body);
  assert.match(payload.blocks[0].text.text, /FAIL - Login/);
  assert.ok(JSON.stringify(payload).includes('Login & logout fails'));
  const passRun = sampleRun({ status: 'PASS' });
  const r = await slack.publish(passRun, ctx({ SLACK_WEBHOOK_URL: 'x', SLACK_NOTIFY_ON: 'failure' }, fetch));
  assert.strictEqual(r.skipped, true);
});

test('teams: adaptive card envelope', () => {
  const card = require('../publishers/teams').buildPayload(sampleRun());
  assert.strictEqual(card.attachments[0].contentType, 'application/vnd.microsoft.card.adaptive');
  assert.strictEqual(card.attachments[0].content.actions[0].url, 'https://ci/3');
});

test('webhook: bearer token and HMAC signature', async () => {
  const webhook = require('../publishers/webhook');
  const fetch = mockFetch([['POST', /example/, '']]);
  await webhook.publish(sampleRun(), ctx({ PEK_WEBHOOK_URL: 'https://example.com/h', PEK_WEBHOOK_TOKEN: 't', PEK_WEBHOOK_SECRET: 's' }, fetch));
  const call = fetch.calls[0];
  assert.strictEqual(call.headers.Authorization, 'Bearer t');
  assert.strictEqual(call.headers['X-PEK-Signature'], webhook.sign(call.body, 's'));
});

test('testrail: case ids from title and annotation, run created, results posted', async () => {
  const testrail = require('../test-management/testrail');
  const fetch = mockFetch([
    ['POST', /add_run\/1$/, { id: 55 }],
    ['POST', /add_results_for_cases\/55$/, []],
  ]);
  const run = sampleRun();
  run.tests[1].annotations.push({ type: 'testrail_case', description: 'C202, 203' });
  const out = await testrail.publish(run, ctx({ TESTRAIL_URL: 'https://tr.example', TESTRAIL_USER: 'u', TESTRAIL_API_KEY: 'k', TESTRAIL_PROJECT_ID: '1' }, fetch));
  assert.strictEqual(out.key, 'R55');
  const runBody = JSON.parse(fetch.calls[0].body);
  assert.deepStrictEqual(runBody.case_ids, [101, 202, 203]);
  const results = JSON.parse(fetch.calls[1].body).results;
  assert.deepStrictEqual(results.map((r) => [r.case_id, r.status_id]), [[101, 1], [202, 5], [203, 5]]);
});

test('testrail/qase: no linked case -> skipped, no HTTP call', async () => {
  const fetch = mockFetch([]);
  const run = sampleRun({ tests: [{ title: 'x', titlePath: ['x'], status: 'passed', durationMs: 1, annotations: [] }] });
  const env = { TESTRAIL_URL: 'u', TESTRAIL_USER: 'u', TESTRAIL_API_KEY: 'k', TESTRAIL_PROJECT_ID: '1', QASE_API_TOKEN: 't', QASE_PROJECT_CODE: 'P' };
  assert.strictEqual((await require('../test-management/testrail').publish(run, ctx(env, fetch))).skipped, true);
  assert.strictEqual((await require('../test-management/qase').publish(run, ctx(env, fetch))).skipped, true);
  assert.strictEqual(fetch.calls.length, 0);
});

test('qase: run + bulk results + complete', async () => {
  const qase = require('../test-management/qase');
  const fetch = mockFetch([
    ['POST', /\/run\/DEMO$/, { status: true, result: { id: 12 } }],
    ['POST', /\/result\/DEMO\/12\/bulk$/, { status: true }],
    ['POST', /\/run\/DEMO\/12\/complete$/, { status: true }],
  ]);
  const out = await qase.publish(sampleRun(), ctx({ QASE_API_TOKEN: 't', QASE_PROJECT_CODE: 'DEMO' }, fetch));
  assert.strictEqual(out.url, 'https://app.qase.io/run/DEMO/dashboard/12');
  assert.strictEqual(fetch.calls[0].headers.Token, 't');
  assert.deepStrictEqual(JSON.parse(fetch.calls[1].body).results.map((r) => [r.case_id, r.status]), [[7, 'passed']]);
  assert.strictEqual(fetch.calls.length, 3);
});

test('zephyr-scale: multipart JUnit upload returns the test cycle', async () => {
  const z = require('../test-management/zephyr-scale');
  const fetch = mockFetch([['POST', /automations\/executions\/junit\?projectKey=PROJ&autoCreateTestCases=true/, { testCycle: { key: 'PROJ-R1', url: 'https://z/PROJ-R1' } }]]);
  const out = await z.publish(sampleRun(), ctx({ ZEPHYR_API_TOKEN: 't', ZEPHYR_PROJECT_KEY: 'PROJ' }, fetch));
  assert.strictEqual(out.key, 'PROJ-R1');
  assert.ok(fetch.calls[0].body instanceof FormData);
});

test('xray: auth + import with test plan, Jira enrichment skipped without Jira creds', async () => {
  const xray = require('../test-management/xray');
  const fetch = mockFetch([
    ['POST', /authenticate$/, '"jwt-token"'],
    ['POST', /import\/execution\/junit\?projectKey=PROJ&testPlanKey=PROJ-100$/, { key: 'PROJ-142' }],
  ]);
  const c = ctx({ XRAY_CLIENT_ID: 'a', XRAY_CLIENT_SECRET: 'b', JIRA_PROJECT_KEY: 'PROJ' }, fetch);
  c.options.testPlanKey = 'PROJ-100';
  const scripts = [];
  c.runNodeScript = async (s) => scripts.push(s);
  const out = await xray.publish(sampleRun(), c);
  assert.strictEqual(out.key, 'PROJ-142');
  assert.strictEqual(fetch.calls[1].headers.Authorization, 'Bearer jwt-token');
  assert.deepStrictEqual(scripts, ['scripts/add-timestamps-to-xray-report.js', 'scripts/remove-test-keys.js']);
});

test('engine: one failing provider does not stop the others; keys flow to publishers', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pek-'));
  fs.copyFileSync(path.join(DIR, 'fixture-junit.xml'), path.join(tmp, 'xray-report.xml'));
  const fetch = mockFetch([
    ['POST', /authenticate$/, '"jwt"'],
    ['POST', /import\/execution\/junit/, { key: 'PROJ-1' }],
    ['POST', /example\.com/, ''],
  ]);
  const env = {
    PEK_ROOT: tmp,
    XRAY_CLIENT_ID: 'a', XRAY_CLIENT_SECRET: 'b', JIRA_PROJECT_KEY: 'PROJ', JIRA_URL: 'https://jira.example',
    TEAMS_WEBHOOK_URL: 'https://broken.invalid/x',
    PEK_WEBHOOK_URL: 'https://example.com/hook',
  };
  const { run, results } = await publish({ env, rootDir: tmp, fetch, log: () => {}, links: [{ label: 'BrowserStack', url: 'https://bs/1', kind: 'grid' }] });
  // the Xray provider calls kit scripts: they are not in tmp, so it errors - and that must not stop the rest
  const byName = Object.fromEntries(results.map((r) => [r.provider, r.status]));
  assert.strictEqual(byName.xray, 'error');
  assert.strictEqual(byName.teams, 'error');
  assert.strictEqual(byName.webhook, 'ok');
  const delivered = JSON.parse(fetch.calls.find((c) => /example\.com/.test(c.url)).body);
  assert.strictEqual(delivered.status, 'FAIL');
  assert.ok(delivered.links.some((l) => l.kind === 'grid'));
  assert.ok(fs.existsSync(path.join(tmp, 'run-result.json')));
  assert.strictEqual(run.stats.total, 3);
});

test('engine: --only and dry run', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pek-'));
  const fetch = mockFetch([]);
  const env = { PEK_ROOT: tmp, SLACK_WEBHOOK_URL: 'https://hooks.slack.com/x', PEK_WEBHOOK_URL: 'https://example.com' };
  const { results } = await publish({ env, rootDir: tmp, fetch, log: () => {}, only: ['slack'], dryRun: true });
  assert.deepStrictEqual(results.map((r) => [r.provider, r.status]), [['slack', 'skipped']]);
  assert.strictEqual(fetch.calls.length, 0);
});
