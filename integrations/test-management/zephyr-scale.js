/**
 * Test management: Zephyr Scale Cloud (SmartBear, Jira app).
 *
 * Uploads the kit's JUnit report as-is and lets Zephyr create a Test Cycle.
 * Test cases are matched by key in the test name (e.g. "PROJ-T12 login works")
 * or auto-created when ZEPHYR_AUTO_CREATE_TEST_CASES is not "false".
 *
 * Docs: https://support.smartbear.com/zephyr-scale-cloud/api-docs/#tag/Automations
 *   POST {base}/automations/executions/junit?projectKey=...&autoCreateTestCases=...
 *   multipart: file (JUnit XML) + testCycle (JSON: name, description)
 */
const fs = require('fs');
const { request } = require('../lib/http');

module.exports = {
  kind: 'test-management',
  name: 'zephyr-scale',
  label: 'Zephyr Scale Cloud',
  description: 'Uploads the JUnit report to Zephyr Scale and creates a Test Cycle.',
  docs: 'https://support.smartbear.com/zephyr-scale-cloud/docs/en/test-automation/upload-test-results.html',
  env: {
    required: ['ZEPHYR_API_TOKEN', 'ZEPHYR_PROJECT_KEY'],
    optional: ['ZEPHYR_BASE_URL', 'ZEPHYR_AUTO_CREATE_TEST_CASES'],
  },

  async publish(run, ctx) {
    const { env } = ctx;
    if (!run.artifacts.junit) throw new Error('JUnit report (xray-report.xml) not found - Zephyr Scale needs it.');
    const base = (env.ZEPHYR_BASE_URL || 'https://api.zephyrscale.smartbear.com/v2').replace(/\/$/, '');
    const qs = new URLSearchParams({
      projectKey: env.ZEPHYR_PROJECT_KEY,
      autoCreateTestCases: env.ZEPHYR_AUTO_CREATE_TEST_CASES === 'false' ? 'false' : 'true',
    });

    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync(run.artifacts.junit)], { type: 'application/xml' }), 'junit.xml');
    form.append(
      'testCycle',
      new Blob(
        [JSON.stringify({ name: `[${run.status}] ${run.scope} - ${run.environment.deviceName}`, description: run.ci?.runUrl || '' })],
        { type: 'application/json' }
      )
    );

    const result = await request(`${base}/automations/executions/junit?${qs}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.ZEPHYR_API_TOKEN}` },
      body: form,
      timeoutMs: 120_000,
      fetch: ctx.fetch,
    });

    const cycle = (result && result.testCycle) || {};
    const key = cycle.key || null;
    const url = cycle.url || null;
    ctx.log(`  Test Cycle created: ${key || '(no key returned)'}`);
    return { key, url, links: url ? [{ kind: 'test-management', label: `Zephyr ${key}`, url }] : [] };
  },
};
