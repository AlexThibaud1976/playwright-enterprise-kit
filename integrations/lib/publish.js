/**
 * Publication engine: builds the RunResult, then hands it to every selected
 * test-management provider (sequentially - their keys/links enrich the run),
 * then to every selected publisher.
 *
 * A failing provider never stops the others: each outcome is reported as
 * ok | skipped | error. The caller decides whether errors are fatal (--strict).
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { createRegistry } = require('../index');
const { buildRunResult } = require('./run-result');

function runNodeScriptFactory(rootDir, env, log) {
  return (script, args = [], extraEnv = {}) =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(rootDir, script), ...args], {
        cwd: rootDir,
        env: { ...env, ...extraEnv },
        shell: false,
        windowsHide: true,
      });
      let out = '';
      child.stdout.on('data', (c) => (out += c));
      child.stderr.on('data', (c) => (out += c));
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) return resolve(out);
        log(out.trim().split('\n').slice(-15).map((l) => `    ${l}`).join('\n'));
        reject(new Error(`${script} exited with code ${code}`));
      });
    });
}

/**
 * @param {{env?: NodeJS.ProcessEnv, rootDir?: string, scope?: string, testPlanKey?: string,
 *          only?: string[], exclude?: string[], links?: Array<{label: string, url: string, kind?: string}>,
 *          jsonPath?: string, junitPath?: string, outPath?: string, dryRun?: boolean,
 *          fetch?: typeof fetch, log?: (msg: string) => void}} options
 */
async function publish(options = {}) {
  const env = options.env || process.env;
  const log = options.log || ((m) => process.stderr.write(m + '\n'));
  const registry = createRegistry({ env, rootDir: options.rootDir });
  const rootDir = registry.rootDir;
  const grid = registry.resolveGrid({ requireConfigured: false });

  const run = buildRunResult({
    rootDir,
    env,
    grid,
    scope: options.scope,
    jsonPath: options.jsonPath,
    junitPath: options.junitPath,
    links: options.links,
  });
  log(`[pek] ${run.status} - ${run.stats.total} test(s) from ${run.source} (grid: ${grid.name})`);

  const filter = { only: options.only, exclude: options.exclude };
  // `only` may name providers of either kind
  const tm = registry.resolveList('test-management', {
    only: filter.only && filter.only.filter((n) => registry.get('test-management', n)),
    exclude: filter.exclude,
  });
  const pubs = registry.resolveList('publisher', {
    only: filter.only && filter.only.filter((n) => registry.get('publisher', n)),
    exclude: filter.exclude,
  });
  if (filter.only && filter.only.length) {
    const unknown = filter.only.filter((n) => !registry.get('test-management', n) && !registry.get('publisher', n));
    if (unknown.length) throw new Error(`Unknown provider(s) in --only: ${unknown.join(', ')}`);
    // with --only, an empty list for one kind means "none of this kind"
    if (!filter.only.some((n) => registry.get('test-management', n))) tm.length = 0;
    if (!filter.only.some((n) => registry.get('publisher', n))) pubs.length = 0;
  }

  const ctx = {
    env,
    rootDir,
    log: (m) => log(m),
    fetch: options.fetch || globalThis.fetch,
    options: { testPlanKey: options.testPlanKey },
    runNodeScript: runNodeScriptFactory(rootDir, env, log),
  };

  const results = [];
  for (const provider of [...tm, ...pubs]) {
    const entry = { kind: provider.kind, provider: provider.name, status: 'ok', message: '', key: null, url: null };
    results.push(entry);
    const missing = registry.missingEnv(provider);
    if (!registry.isConfigured(provider)) {
      entry.status = 'skipped';
      entry.message = `not configured (missing: ${missing.join(', ') || 'see docs'})`;
      log(`[pek] - ${provider.name}: ${entry.message}`);
      continue;
    }
    if (options.dryRun) {
      entry.status = 'skipped';
      entry.message = 'dry run';
      log(`[pek] - ${provider.name}: would publish (dry run)`);
      continue;
    }
    log(`[pek] > ${provider.name}`);
    try {
      const out = (await provider.publish(run, ctx)) || {};
      entry.key = out.key || null;
      entry.url = out.url || null;
      entry.message = out.message || '';
      if (out.skipped) entry.status = 'skipped';
      if (provider.kind === 'test-management' && (out.key || out.url)) {
        run.testManagement[provider.name] = { key: out.key || null, url: out.url || null };
      }
      for (const l of out.links || []) run.links.push(l);
      log(`[pek]   ${entry.status}${entry.message ? `: ${entry.message}` : ''}`);
    } catch (err) {
      entry.status = 'error';
      entry.message = err.message;
      log(`[pek]   error: ${err.message}`);
    }
  }

  const outPath = path.resolve(rootDir, options.outPath || 'run-result.json');
  fs.writeFileSync(outPath, JSON.stringify(run, null, 2));
  log(`[pek] Run result written to ${path.relative(rootDir, outPath) || outPath}`);

  return { run, results, outPath };
}

module.exports = { publish };
