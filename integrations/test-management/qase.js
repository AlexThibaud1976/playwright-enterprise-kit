/**
 * Test management: Qase (qase.io, API v1).
 *
 * Links tests to Qase cases with either:
 *   - an annotation: test.info().annotations.push({ type: 'qase_id', description: '42' })
 *   - or the official reporter's title convention: "user can login (Qase ID: 42)"
 * Tests without an ID are ignored by this provider.
 *
 * Flow: POST /run/{code} -> POST /result/{code}/{run}/bulk -> POST /run/{code}/{run}/complete
 * Docs: https://developers.qase.io/reference/create-run
 *       https://developers.qase.io/reference/create-result-bulk
 */
const { request } = require('../lib/http');
const { annotationValues } = require('../lib/run-result');

function caseIds(test) {
  const ids = annotationValues(test, 'qase_id');
  const title = (test.titlePath || [test.title]).join(' ');
  const m = title.match(/\(Qase ID:\s*([\d,\s]+)\)/i);
  if (m) ids.push(...m[1].split(','));
  return [...new Set(ids.map((v) => Number(String(v).trim())).filter(Boolean))];
}

const STATUS = { passed: 'passed', flaky: 'passed', failed: 'failed', skipped: 'skipped' };

module.exports = {
  kind: 'test-management',
  name: 'qase',
  label: 'Qase',
  description: 'Creates a Qase test run and posts the results of linked cases (qase_id annotation or "(Qase ID: N)" in title).',
  docs: 'https://developers.qase.io/reference/create-run',
  env: {
    required: ['QASE_API_TOKEN', 'QASE_PROJECT_CODE'],
    optional: ['QASE_RUN_ID', 'QASE_BASE_URL', 'QASE_APP_URL', 'QASE_COMPLETE_RUN'],
  },
  caseIds,

  async publish(run, ctx) {
    const { env, log } = ctx;
    const base = (env.QASE_BASE_URL || 'https://api.qase.io/v1').replace(/\/$/, '');
    const code = encodeURIComponent(env.QASE_PROJECT_CODE);
    const headers = { Token: env.QASE_API_TOKEN };

    const results = [];
    for (const t of run.tests) {
      for (const id of caseIds(t)) {
        results.push({
          case_id: id,
          status: STATUS[t.status] || 'skipped',
          time_ms: Math.round(t.durationMs),
          comment: t.status === 'flaky' ? 'Flaky: passed on retry' : undefined,
          stacktrace: t.error || undefined,
        });
      }
    }
    if (!results.length) {
      return { skipped: true, message: 'No test linked to a Qase case (use a qase_id annotation or "(Qase ID: N)" in the title).' };
    }

    let runId = env.QASE_RUN_ID;
    if (!runId) {
      const created = await request(`${base}/run/${code}`, {
        method: 'POST',
        headers,
        json: {
          title: `[${run.status}] ${run.scope} - ${run.environment.deviceName}`,
          description: run.ci?.runUrl || '',
          cases: [...new Set(results.map((r) => r.case_id))],
          is_autotest: true,
        },
        fetch: ctx.fetch,
      });
      runId = created.result && created.result.id;
      if (!runId) throw new Error(`Qase did not return a run id: ${JSON.stringify(created).slice(0, 300)}`);
      log(`  Qase run created: #${runId}`);
    }

    await request(`${base}/result/${code}/${runId}/bulk`, { method: 'POST', headers, json: { results }, fetch: ctx.fetch });
    log(`  ${results.length} result(s) posted to run #${runId}`);

    if (env.QASE_COMPLETE_RUN !== 'false' && !env.QASE_RUN_ID) {
      await request(`${base}/run/${code}/${runId}/complete`, { method: 'POST', headers, fetch: ctx.fetch });
    }

    const app = (env.QASE_APP_URL || 'https://app.qase.io').replace(/\/$/, '');
    const url = `${app}/run/${env.QASE_PROJECT_CODE}/dashboard/${runId}`;
    return { key: `#${runId}`, url, links: [{ kind: 'test-management', label: `Qase run #${runId}`, url }] };
  },
};
