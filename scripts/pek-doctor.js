#!/usr/bin/env node
/**
 * Playwright Enterprise Kit - show which integrations are available / active.
 *
 * Usage:
 *   node scripts/pek-doctor.js          # human-readable table
 *   node scripts/pek-doctor.js --json   # machine-readable (used by the MCP server)
 *
 * Never prints secret values: only the NAMES of missing variables.
 */
const { createRegistry } = require('../integrations');

try {
  const info = createRegistry().describe();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(info));
    process.exit(0);
  }

  const sel = info.selection;
  console.log('Playwright Enterprise Kit - integrations');
  console.log(`Config file : ${info.configFile || '(none, defaults)'}`);
  console.log(`Grid        : ${sel.grid.value} (from ${sel.grid.source})`);
  console.log(`Test mgmt   : ${sel.testManagement.value} (from ${sel.testManagement.source})`);
  console.log(`Publishers  : ${sel.publishers.value} (from ${sel.publishers.source})`);
  if (info.gridError) console.log(`\n!! ${info.gridError}`);
  for (const kind of ['grid', 'test-management', 'publisher']) {
    console.log(`\n[${kind}]`);
    for (const p of info.providers.filter((x) => x.kind === kind)) {
      const state = p.active ? 'ACTIVE ' : p.configured ? 'ready  ' : 'off    ';
      const hint = p.configured ? '' : `  missing: ${p.missingEnv.join(', ')}`;
      console.log(`  ${state} ${p.name.padEnd(15)} ${p.label}${hint}`);
    }
  }
  console.log('\nDocs: docs/integrations.md');
} catch (err) {
  console.error(`[pek-doctor] ${err.message}`);
  process.exit(1);
}
