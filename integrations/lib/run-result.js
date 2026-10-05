/**
 * Builds the tool-agnostic RunResult (run-result.json) consumed by every
 * test-management provider and publisher.
 *
 * Sources, in order of preference:
 *   1. Playwright JSON report (test-results.json) - richest: annotations, errors, projects
 *   2. JUnit XML (xray-report.xml)               - fallback, always produced by the kit
 *
 * RunResult schema (schemaVersion 1):
 * {
 *   schemaVersion: 1,
 *   status: 'PASS' | 'FAIL' | 'UNKNOWN',
 *   scope: string,
 *   startedAt: ISO string | null,
 *   stats: { total, passed, failed, flaky, skipped, durationMs },
 *   environment: { grid, os, osVersion, browser, browserVersion, deviceName, baseUrl, projects[] },
 *   ci: { provider, runUrl, runId, runNumber, repository, branch, commit } | null,
 *   tests: [{ title, titlePath[], file, project, status, durationMs, error, annotations[{type, description}] }],
 *   links: [{ kind, label, url }],
 *   testManagement: { [providerName]: { key?, url? } },
 *   artifacts: { json, junit, html },
 *   source: 'playwright-json' | 'junit' | 'none'
 * }
 */

const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 1;

// ── Playwright JSON report ──────────────────────────────────────────────────

function mapJsonStatus(test) {
  // test.status: 'expected' | 'unexpected' | 'flaky' | 'skipped'
  if (test.status === 'skipped' || test.expectedStatus === 'skipped') return 'skipped';
  if (test.status === 'flaky') return 'flaky';
  if (test.status === 'unexpected') return 'failed';
  return 'passed';
}

function collectAnnotations(test) {
  const seen = new Set();
  const out = [];
  const push = (a) => {
    if (!a || !a.type) return;
    const key = `${a.type}::${a.description ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ type: a.type, description: a.description ?? '' });
  };
  (test.annotations || []).forEach(push);
  for (const r of test.results || []) (r.annotations || []).forEach(push);
  return out;
}

function walkSuites(suites, parents, file, out, depth = 0) {
  for (const suite of suites || []) {
    // Top-level suites are the spec files: their title is the file path, not a describe()
    const isFileSuite = depth === 0;
    const suiteFile = suite.file || file;
    const nextParents = isFileSuite ? [] : suite.title ? [...parents, suite.title] : parents;
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        const results = test.results || [];
        const last = results[results.length - 1] || {};
        const durationMs = results.reduce((sum, r) => sum + (r.duration || 0), 0);
        const errorMessage = last.error?.message || (last.errors && last.errors[0]?.message) || null;
        out.push({
          title: spec.title,
          titlePath: [...nextParents, spec.title],
          file: spec.file || suiteFile || null,
          project: test.projectName || null,
          status: mapJsonStatus(test),
          durationMs,
          startedAt: results[0]?.startTime || null,
          error: errorMessage ? stripAnsi(errorMessage).slice(0, 2000) : null,
          annotations: collectAnnotations(test),
          tags: spec.tags || [],
        });
      }
    }
    walkSuites(suite.suites, nextParents, suiteFile, out, depth + 1);
  }
}

function fromPlaywrightJson(report) {
  const tests = [];
  walkSuites(report.suites, [], null, tests);
  return {
    tests,
    startedAt: report.stats?.startTime || null,
    durationMs: report.stats?.duration ?? tests.reduce((s, t) => s + t.durationMs, 0),
    projects: [...new Set((report.config?.projects || []).map((p) => p.name).filter(Boolean))],
  };
}

// ── JUnit XML ───────────────────────────────────────────────────────────────

function xmlUnescape(s) {
  return String(s ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? xmlUnescape(m[1]) : null;
}

function fromJUnit(xml) {
  const tests = [];
  const firstSuite = xml.match(/<testsuite\b[^>]*>/);
  const startedAt = firstSuite ? attr(firstSuite[0], 'timestamp') : null;
  const re = /<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const openTag = `<testcase${m[1]}>`;
    const inner = m[3] || '';
    const name = attr(openTag, 'name') || 'unnamed';
    const classname = attr(openTag, 'classname') || '';
    let status = 'passed';
    let error = null;
    const failure = inner.match(/<(failure|error)\b([^>]*)>?/);
    if (failure) {
      status = 'failed';
      error = attr(`<x${failure[2]}>`, 'message') || 'failed';
    } else if (/<skipped\b/.test(inner)) {
      status = 'skipped';
    }
    const annotations = [];
    const propRe = /<property\s+name="([^"]*)"\s+value="([^"]*)"/g;
    let p;
    while ((p = propRe.exec(inner)) !== null) {
      annotations.push({ type: xmlUnescape(p[1]), description: xmlUnescape(p[2]) });
    }
    tests.push({
      title: name,
      titlePath: [name],
      file: classname || null,
      project: null,
      status,
      durationMs: Math.round(parseFloat(attr(openTag, 'time') || '0') * 1000),
      startedAt: attr(openTag, 'started-at'),
      error: error ? error.slice(0, 2000) : null,
      annotations,
      tags: [],
    });
  }
  return {
    tests,
    startedAt,
    durationMs: tests.reduce((s, t) => s + t.durationMs, 0),
    projects: [],
  };
}

// ── CI detection (GitHub Actions, GitLab CI, Azure DevOps, Jenkins) ─────────

function detectCi(env) {
  if (env.GITHUB_ACTIONS === 'true' && env.GITHUB_REPOSITORY && env.GITHUB_RUN_ID) {
    const server = env.GITHUB_SERVER_URL || 'https://github.com';
    return {
      provider: 'github-actions',
      runUrl: `${server}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`,
      runId: env.GITHUB_RUN_ID,
      runNumber: env.GITHUB_RUN_NUMBER || null,
      repository: env.GITHUB_REPOSITORY,
      branch: env.GITHUB_REF_NAME || null,
      commit: env.GITHUB_SHA || null,
    };
  }
  if (env.GITLAB_CI === 'true') {
    return {
      provider: 'gitlab-ci',
      runUrl: env.CI_PIPELINE_URL || null,
      runId: env.CI_PIPELINE_ID || null,
      runNumber: env.CI_PIPELINE_IID || null,
      repository: env.CI_PROJECT_PATH || null,
      branch: env.CI_COMMIT_REF_NAME || null,
      commit: env.CI_COMMIT_SHA || null,
    };
  }
  if (env.TF_BUILD === 'True' || env.TF_BUILD === 'true') {
    const base = env.SYSTEM_COLLECTIONURI && env.SYSTEM_TEAMPROJECT
      ? `${env.SYSTEM_COLLECTIONURI}${encodeURIComponent(env.SYSTEM_TEAMPROJECT)}/_build/results?buildId=${env.BUILD_BUILDID}`
      : null;
    return {
      provider: 'azure-devops',
      runUrl: base,
      runId: env.BUILD_BUILDID || null,
      runNumber: env.BUILD_BUILDNUMBER || null,
      repository: env.BUILD_REPOSITORY_NAME || null,
      branch: env.BUILD_SOURCEBRANCHNAME || null,
      commit: env.BUILD_SOURCEVERSION || null,
    };
  }
  if (env.JENKINS_URL && env.BUILD_URL) {
    return {
      provider: 'jenkins',
      runUrl: env.BUILD_URL,
      runId: env.BUILD_ID || null,
      runNumber: env.BUILD_NUMBER || null,
      repository: env.JOB_NAME || null,
      branch: env.BRANCH_NAME || env.GIT_BRANCH || null,
      commit: env.GIT_COMMIT || null,
    };
  }
  return null;
}

// ── Assembly ────────────────────────────────────────────────────────────────

function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return String(s).replace(/\u001b\[[0-9;]*m/g, '');
}

function computeStats(tests, durationMs) {
  const count = (s) => tests.filter((t) => t.status === s).length;
  return {
    total: tests.length,
    passed: count('passed'),
    failed: count('failed'),
    flaky: count('flaky'),
    skipped: count('skipped'),
    durationMs: Math.round(durationMs || 0),
  };
}

function computeStatus(stats) {
  if (stats.total === 0) return 'UNKNOWN';
  return stats.failed > 0 ? 'FAIL' : 'PASS';
}

/**
 * @param {{rootDir: string, env?: NodeJS.ProcessEnv, grid?: any, scope?: string,
 *          jsonPath?: string, junitPath?: string, htmlPath?: string,
 *          links?: Array<{kind?: string, label: string, url: string}>}} options
 */
function buildRunResult(options) {
  const env = options.env || process.env;
  const rootDir = options.rootDir;
  const resolve = (p) => (path.isAbsolute(p) ? p : path.join(rootDir, p));
  const jsonPath = resolve(options.jsonPath || 'test-results.json');
  const junitPath = resolve(options.junitPath || 'xray-report.xml');
  const htmlPath = resolve(options.htmlPath || 'playwright-report');

  let parsed = { tests: [], startedAt: null, durationMs: 0, projects: [] };
  let source = 'none';

  if (fs.existsSync(jsonPath)) {
    try {
      parsed = fromPlaywrightJson(JSON.parse(fs.readFileSync(jsonPath, 'utf8')));
      source = 'playwright-json';
    } catch (err) {
      process.stderr.write(`[pek] Could not parse ${jsonPath}: ${err.message} - falling back to JUnit\n`);
    }
  }
  if (source === 'none' && fs.existsSync(junitPath)) {
    parsed = fromJUnit(fs.readFileSync(junitPath, 'utf8'));
    source = 'junit';
  }

  const stats = computeStats(parsed.tests, parsed.durationMs);
  const grid = options.grid;
  const target = (grid && typeof grid.describeTarget === 'function' && grid.describeTarget(env)) || {};
  const projects = parsed.projects.length
    ? parsed.projects
    : [...new Set(parsed.tests.map((t) => t.project).filter(Boolean))];

  const ci = detectCi(env);
  const links = [];
  if (ci && ci.runUrl) links.push({ kind: 'ci', label: `CI run${ci.runNumber ? ` #${ci.runNumber}` : ''}`, url: ci.runUrl });
  for (const l of options.links || []) {
    if (l && l.url) links.push({ kind: l.kind || l.label.toLowerCase(), label: l.label, url: l.url });
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    status: computeStatus(stats),
    scope: options.scope || env.PEK_TEST_SCOPE || 'All Tests',
    startedAt: parsed.startedAt,
    stats,
    environment: {
      grid: grid ? grid.name : 'local',
      os: target.os || null,
      osVersion: target.osVersion || null,
      browser: target.browser || (projects.length === 1 ? projects[0] : null),
      browserVersion: target.browserVersion || null,
      deviceName: env.DEVICE_NAME || target.deviceName || (grid ? grid.name : 'local'),
      baseUrl: env.BASE_URL || null,
      projects,
    },
    ci,
    tests: parsed.tests,
    links,
    testManagement: {},
    artifacts: {
      json: fs.existsSync(jsonPath) ? jsonPath : null,
      junit: fs.existsSync(junitPath) ? junitPath : null,
      html: fs.existsSync(htmlPath) ? htmlPath : null,
    },
    source,
  };
}

/** Human-friendly one-liner used by publishers. */
function headline(run) {
  const s = run.stats;
  const parts = [`${s.passed} passed`];
  if (s.failed) parts.push(`${s.failed} failed`);
  if (s.flaky) parts.push(`${s.flaky} flaky`);
  if (s.skipped) parts.push(`${s.skipped} skipped`);
  return `[${run.status}] ${run.scope} - ${parts.join(', ')} (${(s.durationMs / 1000).toFixed(1)}s)`;
}

/** Annotation values of a given type, split on commas. */
function annotationValues(test, type) {
  return (test.annotations || [])
    .filter((a) => a.type === type && a.description)
    .flatMap((a) => String(a.description).split(','))
    .map((v) => v.trim())
    .filter(Boolean);
}

module.exports = {
  SCHEMA_VERSION,
  buildRunResult,
  fromPlaywrightJson,
  fromJUnit,
  detectCi,
  computeStats,
  computeStatus,
  headline,
  annotationValues,
};
