/**
 * Shared formatting for publishers (Markdown, plain text, failure list).
 */
const { headline } = require('../lib/run-result');

const ICON = { PASS: '✅', FAIL: '❌', UNKNOWN: '⚪' };

function environmentLine(run) {
  const e = run.environment;
  const parts = [
    `grid: ${e.grid}`,
    [e.os, e.osVersion].filter(Boolean).join(' '),
    [e.browser, e.browserVersion].filter(Boolean).join(' '),
    e.projects && e.projects.length > 1 ? `projects: ${e.projects.join(', ')}` : '',
  ].filter(Boolean);
  return parts.join(' · ');
}

function failures(run, max = 10) {
  return run.tests.filter((t) => t.status === 'failed').slice(0, max);
}

function toMarkdown(run) {
  const s = run.stats;
  const lines = [
    `### ${ICON[run.status] || ''} ${run.status} — ${run.scope}`,
    '',
    '| Total | Passed | Failed | Flaky | Skipped | Duration |',
    '|---|---|---|---|---|---|',
    `| ${s.total} | ${s.passed} | ${s.failed} | ${s.flaky} | ${s.skipped} | ${(s.durationMs / 1000).toFixed(1)}s |`,
    '',
    `**Environment:** ${environmentLine(run)}`,
  ];
  if (run.links.length) {
    lines.push('', '**Links:** ' + run.links.map((l) => `[${l.label}](${l.url})`).join(' · '));
  }
  const failed = failures(run);
  if (failed.length) {
    lines.push('', '<details><summary>Failed tests</summary>', '');
    for (const t of failed) lines.push(`- **${t.titlePath.join(' › ')}**${t.error ? ` — \`${t.error.split('\n')[0].slice(0, 200)}\`` : ''}`);
    lines.push('', '</details>');
  }
  return lines.join('\n');
}

module.exports = { ICON, environmentLine, failures, toMarkdown, headline };
