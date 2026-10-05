/**
 * TEMPLATE - copy to integrations/custom/<name>.js, adapt, then declare it in
 * pek.config.js:   plugins: ['./integrations/custom/<name>.js']
 *
 * The same shape works for kind 'test-management' (return { key, url } so the
 * other publishers can link to it). Grid providers are described in
 * docs/integrations.md (section "Writing your own provider").
 */
const { request } = require('../lib/http');
const { headline } = require('../lib/run-result');

module.exports = {
  kind: 'publisher', //           'publisher' | 'test-management' | 'grid'
  name: 'my-tool', //             kebab-case, used in PEK_PUBLISHERS / --only
  label: 'My Tool',
  description: 'Sends the run summary to My Tool.',
  docs: 'https://example.com/api-docs',
  // Auto-enabled (selection 'auto') when every required variable is set.
  env: { required: ['MY_TOOL_URL', 'MY_TOOL_TOKEN'], optional: [] },

  /**
   * @param {object} run  RunResult (see integrations/lib/run-result.js)
   * @param {{env, log, fetch, rootDir, options, runNodeScript}} ctx
   * @returns {Promise<{key?, url?, links?, message?, skipped?}>}
   */
  async publish(run, ctx) {
    await request(ctx.env.MY_TOOL_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ctx.env.MY_TOOL_TOKEN}` },
      json: { text: headline(run), status: run.status, links: run.links },
      fetch: ctx.fetch,
    });
    return { message: 'sent' };
  },
};
