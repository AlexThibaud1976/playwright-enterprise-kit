const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { fromJUnit, fromPlaywrightJson, buildRunResult, detectCi } = require('../lib/run-result');

const DIR = __dirname;

test('JUnit fallback parses statuses, errors, properties and entities', () => {
  const r = fromJUnit(fs.readFileSync(path.join(DIR, 'fixture-junit.xml'), 'utf8'));
  assert.deepStrictEqual(r.tests.map((t) => t.status), ['passed', 'failed', 'skipped']);
  assert.strictEqual(r.tests[1].title, 'Login & logout fails');
  assert.strictEqual(r.tests[1].error, 'expected "a" to be "b"');
  assert.deepStrictEqual(r.tests[0].annotations, [{ type: 'qase_id', description: '7' }]);
  assert.strictEqual(r.startedAt, '2026-10-05T10:00:00.000Z');
});

test('Playwright JSON report: describe titles kept, file suite dropped', () => {
  const r = fromPlaywrightJson(JSON.parse(fs.readFileSync(path.join(DIR, 'fixture-playwright-report.json'), 'utf8')));
  assert.ok(r.tests.length > 0);
  assert.strictEqual(r.tests[0].titlePath[0], 'Sanity - Framework health check');
  assert.ok(r.tests.every((t) => ['passed', 'failed', 'flaky', 'skipped'].includes(t.status)));
});

test('buildRunResult prefers JSON, falls back to JUnit, UNKNOWN without reports', () => {
  const env = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'o/r', GITHUB_RUN_ID: '9', GITHUB_RUN_NUMBER: '3' };
  const fromJson = buildRunResult({ rootDir: DIR, env, jsonPath: 'fixture-playwright-report.json', junitPath: 'fixture-junit.xml' });
  assert.strictEqual(fromJson.source, 'playwright-json');
  assert.strictEqual(fromJson.links[0].url, 'https://github.com/o/r/actions/runs/9');

  const fromXml = buildRunResult({ rootDir: DIR, env: {}, jsonPath: 'missing.json', junitPath: 'fixture-junit.xml', scope: 'Login' });
  assert.strictEqual(fromXml.source, 'junit');
  assert.strictEqual(fromXml.status, 'FAIL');
  assert.deepStrictEqual(fromXml.stats, { total: 3, passed: 1, failed: 1, flaky: 0, skipped: 1, durationMs: 3500 });

  const empty = buildRunResult({ rootDir: DIR, env: {}, jsonPath: 'missing.json', junitPath: 'missing.xml' });
  assert.strictEqual(empty.status, 'UNKNOWN');
  assert.strictEqual(empty.source, 'none');
});

test('CI detection beyond GitHub (GitLab, Jenkins)', () => {
  assert.strictEqual(detectCi({ GITLAB_CI: 'true', CI_PIPELINE_URL: 'https://gl/p/1' }).runUrl, 'https://gl/p/1');
  assert.strictEqual(detectCi({ JENKINS_URL: 'https://j', BUILD_URL: 'https://j/job/1/' }).provider, 'jenkins');
  assert.strictEqual(detectCi({}), null);
});
