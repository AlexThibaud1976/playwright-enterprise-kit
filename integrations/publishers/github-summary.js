/**
 * Publisher: GitHub Actions job summary (Markdown).
 * Auto-enabled inside GitHub Actions (GITHUB_STEP_SUMMARY is set by the runner).
 * Docs: https://docs.github.com/en/actions/reference/workflow-commands-for-github-actions#adding-a-job-summary
 */
const fs = require('fs');
const { toMarkdown } = require('./format');

module.exports = {
  kind: 'publisher',
  name: 'github-summary',
  label: 'GitHub Actions job summary',
  description: 'Writes a Markdown summary (result, environment, links, failures) to the job summary page.',
  docs: 'https://docs.github.com/en/actions/reference/workflow-commands-for-github-actions#adding-a-job-summary',
  env: { required: ['GITHUB_STEP_SUMMARY'], optional: [] },

  async publish(run, ctx) {
    fs.appendFileSync(ctx.env.GITHUB_STEP_SUMMARY, toMarkdown(run) + '\n');
    return { message: 'Job summary written' };
  },
};
