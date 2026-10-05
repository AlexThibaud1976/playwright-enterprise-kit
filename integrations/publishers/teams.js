/**
 * Publisher: Microsoft Teams - Adaptive Card through a Teams Workflows webhook
 * ("When a Teams webhook request is received" / "Post to a channel when a
 * webhook request is received"). Legacy Office 365 connector URLs accept the
 * same payload.
 * Docs: https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook
 *
 * TEAMS_WEBHOOK_URL   workflow HTTP trigger URL (secret)
 * TEAMS_NOTIFY_ON     all (default) | failure
 */
const { request } = require('../lib/http');
const { ICON, environmentLine, failures, headline } = require('./format');

function buildPayload(run) {
  const s = run.stats;
  const body = [
    {
      type: 'TextBlock',
      size: 'Large',
      weight: 'Bolder',
      wrap: true,
      color: run.status === 'PASS' ? 'Good' : run.status === 'FAIL' ? 'Attention' : 'Default',
      text: `${ICON[run.status]} ${run.status} - ${run.scope}`,
    },
    {
      type: 'FactSet',
      facts: [
        { title: 'Passed', value: String(s.passed) },
        { title: 'Failed', value: String(s.failed) },
        { title: 'Flaky', value: String(s.flaky) },
        { title: 'Skipped', value: String(s.skipped) },
        { title: 'Duration', value: `${(s.durationMs / 1000).toFixed(1)}s` },
        { title: 'Environment', value: environmentLine(run) },
      ],
    },
  ];
  const failed = failures(run, 5);
  if (failed.length) {
    body.push({ type: 'TextBlock', wrap: true, text: '**Failed tests**\n\n' + failed.map((t) => `- ${t.titlePath.join(' › ')}`).join('\n') });
  }
  return {
    type: 'message',
    summary: headline(run),
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        contentUrl: null,
        content: {
          $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body,
          actions: run.links.slice(0, 5).map((l) => ({ type: 'Action.OpenUrl', title: l.label, url: l.url })),
        },
      },
    ],
  };
}

module.exports = {
  kind: 'publisher',
  name: 'teams',
  label: 'Microsoft Teams',
  description: 'Posts an Adaptive Card to a Teams channel through a Workflows webhook.',
  docs: 'https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook',
  env: { required: ['TEAMS_WEBHOOK_URL'], optional: ['TEAMS_NOTIFY_ON'] },
  buildPayload,

  async publish(run, ctx) {
    if (ctx.env.TEAMS_NOTIFY_ON === 'failure' && run.status === 'PASS') {
      return { skipped: true, message: 'TEAMS_NOTIFY_ON=failure and the run passed' };
    }
    await request(ctx.env.TEAMS_WEBHOOK_URL, { method: 'POST', json: buildPayload(run), fetch: ctx.fetch });
    return { message: 'Card posted' };
  },
};
