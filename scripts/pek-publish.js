#!/usr/bin/env node
/**
 * Playwright Enterprise Kit - publish the last run to every active integration.
 *
 * Builds run-result.json from test-results.json (or xray-report.xml), then
 * sends it to the selected test-management tools and publishers.
 * Works with ZERO integrations configured (it then only writes run-result.json).
 *
 * Usage:
 *   node scripts/pek-publish.js [options]
 *
 * Options:
 *   --scope <label>        Scope label (default: "All Tests" or PEK_TEST_SCOPE)
 *   --test-plan <KEY>      Xray Test Plan key (or XRAY_TEST_PLAN_KEY)
 *   --only <a,b>           Only these providers (names, any kind)
 *   --exclude <a,b>        Skip these providers
 *   --link <Label=url>     Extra link shown by publishers (repeatable). A label
 *                          starting with "grid:" is tagged as the grid build link.
 *   --report <file>        Playwright JSON report (default: test-results.json)
 *   --junit <file>         JUnit report (default: xray-report.xml)
 *   --out <file>           Output file (default: run-result.json)
 *   --dry-run              Build run-result.json, show what would be published
 *   --strict               Exit 1 if a provider errors
 *   --json                 Print a machine-readable summary as the last stdout line
 *
 * Exports (GitHub Actions): status, run_result to $GITHUB_OUTPUT.
 */
const fs = require('fs');
const { publish } = require('../integrations/lib/publish');
const { splitList } = require('../integrations');

function parseArgs(argv) {
  const opts = { links: [], only: [], exclude: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`Missing value for ${a}`);
      return v;
    };
    switch (a) {
      case '--scope': opts.scope = next(); break;
      case '--test-plan': opts.testPlanKey = next(); break;
      case '--only': opts.only.push(...splitList(next())); break;
      case '--exclude': opts.exclude.push(...splitList(next())); break;
      case '--report': opts.jsonPath = next(); break;
      case '--junit': opts.junitPath = next(); break;
      case '--out': opts.outPath = next(); break;
      case '--dry-run': opts.dryRun = true; break;
      case '--strict': opts.strict = true; break;
      case '--json': opts.json = true; break;
      case '--link': {
        const raw = next();
        const idx = raw.indexOf('=');
        if (idx <= 0) throw new Error(`--link expects Label=url, got '${raw}'`);
        let label = raw.slice(0, idx).trim();
        const url = raw.slice(idx + 1).trim();
        let kind;
        if (label.startsWith('grid:')) {
          kind = 'grid';
          label = label.slice(5);
        }
        if (url) opts.links.push({ label, url, kind });
        break;
      }
      case '-h':
      case '--help':
        console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]);
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown option: ${a}`);
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { run, results, outPath } = await publish(opts);

  const summary = {
    status: run.status,
    stats: run.stats,
    grid: run.environment.grid,
    runResult: outPath,
    links: run.links,
    results,
  };

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `status=${run.status}\nrun_result=${outPath}\n`);
  }

  if (opts.json) {
    console.log(JSON.stringify(summary));
  } else {
    console.log(`\nResult: ${run.status} (${run.stats.passed}/${run.stats.total} passed)`);
    for (const r of results) console.log(`  ${r.status.padEnd(7)} ${r.kind.padEnd(15)} ${r.provider}${r.message ? ` - ${r.message}` : ''}`);
    if (!results.length) console.log('  (no integration selected - run-result.json only)');
  }

  if (opts.strict && results.some((r) => r.status === 'error')) process.exit(1);
}

main().catch((err) => {
  console.error(`[pek-publish] ${err.message}`);
  process.exit(1);
});
