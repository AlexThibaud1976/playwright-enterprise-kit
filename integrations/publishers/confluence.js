/**
 * Publisher: Confluence "Test Execution Dashboard" - thin adapter around the
 * historical scripts/update-confluence-report.js (unchanged, single source of truth).
 *
 * The Xray Test Execution key (if Xray ran in the same publish) and the grid
 * build URL (link kind 'grid') are forwarded to the script.
 */
module.exports = {
  kind: 'publisher',
  name: 'confluence',
  label: 'Confluence dashboard',
  description: 'Appends a row to the Confluence "Test Execution Dashboard" page (creates it if missing).',
  docs: 'https://developer.atlassian.com/cloud/confluence/rest/v1/api-group-content/',
  env: {
    required: ['CONFLUENCE_URL', 'CONFLUENCE_USER', 'CONFLUENCE_API_TOKEN', 'CONFLUENCE_SPACE_KEY'],
    optional: ['CONFLUENCE_PAGE_TITLE', 'CONFLUENCE_PARENT_PAGE_ID', 'JIRA_URL'],
  },

  async publish(run, ctx) {
    const args = ['--test-result', run.status, '--test-scope', run.scope];
    const execKey = run.testManagement.xray && run.testManagement.xray.key;
    if (execKey) args.push('--exec-key', execKey);
    const gridLink = run.links.find((l) => l.kind === 'grid' || l.kind === 'browserstack');
    if (gridLink) args.push('--browserstack-url', gridLink.url);
    if (run.ci) {
      if (run.ci.runNumber) args.push('--run-number', String(run.ci.runNumber));
      if (run.ci.runId) args.push('--run-id', String(run.ci.runId));
      if (run.ci.repository && run.ci.provider === 'github-actions') args.push('--repository', run.ci.repository);
    }
    const e = run.environment;
    const out = await ctx.runNodeScript('scripts/update-confluence-report.js', args, {
      DEVICE_NAME: e.deviceName || '',
      BS_OS: e.os || '',
      BS_OS_VERSION: e.osVersion || '',
      BS_BROWSER: e.browser || '',
      BS_BROWSER_VERSION: e.browserVersion || '',
    });
    const m = out.match(/View:\s*(\S+)/);
    return { url: m ? m[1] : null, links: m ? [{ kind: 'publisher', label: 'Confluence dashboard', url: m[1] }] : [] };
  },
};
