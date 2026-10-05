/**
 * Publisher: Slack incoming webhook.
 * Docs: https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks
 *
 * SLACK_WEBHOOK_URL       https://hooks.slack.com/services/...   (secret)
 * SLACK_NOTIFY_ON         all (default) | failure                (optional)
 */
const { request } = require('../lib/http');
const { ICON, environmentLine, failures, headline } = require('./format');

function buildPayload(run) {
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: `${ICON[run.status]} ${run.status} - ${run.scope}`.slice(0, 150) } },
    { type: 'section', text: { type: 'mrkdwn', text: `${headline(run)}\n_${environmentLine(run)}_` } },
  ];
  const failed = failures(run, 5);
  if (failed.length) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '*Failed tests*\n' + failed.map((t) => `• ${t.titlePath.join(' › ')}`).join('\n') },
    });
  }
  if (run.links.length) {
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: run.links.map((l) => `<${l.url}|${l.label}>`).join('  ·  ') }] });
  }
  return { text: headline(run), blocks };
}

module.exports = {
  kind: 'publisher',
  name: 'slack',
  label: 'Slack',
  description: 'Posts a result card to a Slack channel through an incoming webhook.',
  docs: 'https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks',
  env: { required: ['SLACK_WEBHOOK_URL'], optional: ['SLACK_NOTIFY_ON'] },
  buildPayload,

  async publish(run, ctx) {
    if (ctx.env.SLACK_NOTIFY_ON === 'failure' && run.status === 'PASS') {
      return { skipped: true, message: 'SLACK_NOTIFY_ON=failure and the run passed' };
    }
    await request(ctx.env.SLACK_WEBHOOK_URL, { method: 'POST', json: buildPayload(run), fetch: ctx.fetch });
    return { message: 'Message posted' };
  },
};
