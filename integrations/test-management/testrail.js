/**
 * Test management: TestRail (Cloud or Server, API v2).
 *
 * Links Playwright tests to TestRail cases with either:
 *   - an annotation:  test.info().annotations.push({ type: 'testrail_case', description: 'C123' })
 *   - or the case ID in the title: test('C123 user can login', ...)
 * Tests without a case ID are ignored by this provider.
 *
 * Flow: add_run (or reuse TESTRAIL_RUN_ID) -> add_results_for_cases -> close_run (optional)
 * Docs: https://support.testrail.com/hc/en-us/articles/7077874763156-Results
 *       https://support.testrail.com/hc/en-us/articles/7077927349012-Runs
 */
const { request, basicAuth } = require('../lib/http');
const { annotationValues } = require('../lib/run-result');

// TestRail default statuses: 1 Passed, 2 Blocked, 3 Untested, 4 Retest, 5 Failed
const STATUS = { passed: 1, flaky: 1, failed: 5 };

function caseIds(test) {
  const ids = annotationValues(test, 'testrail_case');
  const fromTitle = (test.titlePath || [test.title]).join(' ').match(/\bC(\d+)\b/g) || [];
  return [...new Set([...ids, ...fromTitle].map((v) => Number(String(v).replace(/^C/i, ''))).filter(Boolean))];
}

module.exports = {
  kind: 'test-management',
  name: 'testrail',
  label: 'TestRail',
  description: 'Creates a TestRail run and posts one result per linked case (testrail_case annotation or C123 in title).',
  docs: 'https://support.testrail.com/hc/en-us/articles/7077083596436-Introduction-to-the-TestRail-API',
  env: {
    required: ['TESTRAIL_URL', 'TESTRAIL_USER', 'TESTRAIL_API_KEY', 'TESTRAIL_PROJECT_ID'],
    optional: ['TESTRAIL_SUITE_ID', 'TESTRAIL_RUN_ID', 'TESTRAIL_CLOSE_RUN'],
  },
  caseIds,

  async publish(run, ctx) {
    const { env, log } = ctx;
    const base = `${env.TESTRAIL_URL.replace(/\/$/, '')}/index.php?/api/v2`;
    const headers = { Authorization: basicAuth(env.TESTRAIL_USER, env.TESTRAIL_API_KEY) };

    const results = [];
    for (const t of run.tests) {
      if (!(t.status in STATUS)) continue; // skipped tests stay "Untested"
      for (const id of caseIds(t)) {
        results.push({
          case_id: id,
          status_id: STATUS[t.status],
          comment: [t.titlePath.join(' > '), t.status === 'flaky' ? '(flaky: passed on retry)' : '', t.error || '']
            .filter(Boolean)
            .join('\n'),
          elapsed: `${Math.max(1, Math.round(t.durationMs / 1000))}s`,
        });
      }
    }
    if (!results.length) {
      return { skipped: true, message: 'No test linked to a TestRail case (use a testrail_case annotation or C123 in the title).' };
    }

    let runId = env.TESTRAIL_RUN_ID;
    if (!runId) {
      const body = {
        name: `[${run.status}] ${run.scope} - ${run.environment.deviceName}`,
        description: run.ci?.runUrl || '',
        include_all: false,
        case_ids: [...new Set(results.map((r) => r.case_id))],
      };
      if (env.TESTRAIL_SUITE_ID) body.suite_id = Number(env.TESTRAIL_SUITE_ID);
      const created = await request(`${base}/add_run/${env.TESTRAIL_PROJECT_ID}`, { method: 'POST', headers, json: body, fetch: ctx.fetch });
      runId = created.id;
      log(`  TestRail run created: R${runId}`);
    }

    await request(`${base}/add_results_for_cases/${runId}`, { method: 'POST', headers, json: { results }, fetch: ctx.fetch });
    log(`  ${results.length} result(s) posted to R${runId}`);

    if (env.TESTRAIL_CLOSE_RUN === 'true') {
      await request(`${base}/close_run/${runId}`, { method: 'POST', headers, json: {}, fetch: ctx.fetch });
    }

    const url = `${env.TESTRAIL_URL.replace(/\/$/, '')}/index.php?/runs/view/${runId}`;
    return { key: `R${runId}`, url, links: [{ kind: 'test-management', label: `TestRail R${runId}`, url }] };
  },
};
