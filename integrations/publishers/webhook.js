/**
 * Publisher: generic HTTP webhook - the universal adapter.
 *
 * POSTs the full RunResult JSON (see integrations/lib/run-result.js) to any URL:
 * an in-house dashboard, n8n / Zapier / Make, Power Automate, a Lambda, ...
 *
 *   PEK_WEBHOOK_URL      target URL (required)
 *   PEK_WEBHOOK_TOKEN    sent as "Authorization: Bearer <token>" (optional)
 *   PEK_WEBHOOK_SECRET   HMAC-SHA256 of the raw body, sent as
 *                        "X-PEK-Signature: sha256=<hex>" (optional)
 */
const crypto = require('crypto');
const { request } = require('../lib/http');

function sign(body, secret) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

module.exports = {
  kind: 'publisher',
  name: 'webhook',
  label: 'Generic webhook',
  description: 'POSTs the run-result.json payload to any HTTP endpoint (optional bearer token / HMAC signature).',
  docs: null,
  env: { required: ['PEK_WEBHOOK_URL'], optional: ['PEK_WEBHOOK_TOKEN', 'PEK_WEBHOOK_SECRET'] },
  sign,

  async publish(run, ctx) {
    const { env } = ctx;
    const body = JSON.stringify(run);
    const headers = { 'Content-Type': 'application/json', 'User-Agent': 'playwright-enterprise-kit' };
    if (env.PEK_WEBHOOK_TOKEN) headers.Authorization = `Bearer ${env.PEK_WEBHOOK_TOKEN}`;
    if (env.PEK_WEBHOOK_SECRET) headers['X-PEK-Signature'] = sign(body, env.PEK_WEBHOOK_SECRET);
    await request(env.PEK_WEBHOOK_URL, { method: 'POST', headers, body, fetch: ctx.fetch });
    return { message: 'Payload delivered' };
  },
};
