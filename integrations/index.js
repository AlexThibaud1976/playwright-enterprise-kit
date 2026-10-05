/**
 * Playwright Enterprise Kit - Integration registry
 *
 * The kit talks to third-party tools through three kinds of providers:
 *
 *   grid             WHERE the browsers run      local (default), browserstack, lambdatest, remote
 *   test-management  WHERE the results are kept  xray, zephyr-scale, testrail, qase
 *   publisher        WHO gets notified           github-summary, confluence, slack, teams, webhook
 *
 * Selection (first match wins):
 *   1. Environment variables  PEK_GRID, PEK_TEST_MANAGEMENT, PEK_PUBLISHERS
 *   2. pek.config.js          { grid, testManagement, publishers }
 *   3. 'auto'                 every provider whose credentials are present
 *                             (grid: browserstack > lambdatest > remote > local)
 *
 * 'auto' reproduces the historical behaviour: with BrowserStack credentials the
 * tests run on BrowserStack, without them they run locally. 'none' disables a
 * kind entirely. Explicit lists ("xray,slack") select providers by name.
 *
 * Custom providers are loaded from pek.config.js `plugins` (or PEK_PLUGINS,
 * comma-separated paths relative to the kit root). A plugin exports one
 * provider object or an array of them - see docs/integrations.md.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = process.env.PEK_ROOT ? path.resolve(process.env.PEK_ROOT) : path.resolve(__dirname, '..');

const KINDS = ['grid', 'test-management', 'publisher'];

const BUILTIN = [
  require('./grids/local'),
  require('./grids/browserstack'),
  require('./grids/lambdatest'),
  require('./grids/remote'),
  require('./test-management/xray'),
  require('./test-management/zephyr-scale'),
  require('./test-management/testrail'),
  require('./test-management/qase'),
  require('./publishers/github-summary'),
  require('./publishers/confluence'),
  require('./publishers/slack'),
  require('./publishers/teams'),
  require('./publishers/webhook'),
];

// Grid auto-detection order (first configured wins, local is the fallback)
const GRID_AUTO_ORDER = ['browserstack', 'lambdatest', 'remote'];

const SELECTION_ENV = {
  grid: 'PEK_GRID',
  'test-management': 'PEK_TEST_MANAGEMENT',
  publisher: 'PEK_PUBLISHERS',
};
const SELECTION_CONFIG = {
  grid: 'grid',
  'test-management': 'testManagement',
  publisher: 'publishers',
};

// ── Config file ─────────────────────────────────────────────────────────────

function loadConfigFile(rootDir = ROOT_DIR) {
  const file = path.join(rootDir, 'pek.config.js');
  if (!fs.existsSync(file)) return {};
  // eslint-disable-next-line import/no-dynamic-require
  const cfg = require(file);
  return cfg && typeof cfg === 'object' ? cfg : {};
}

// ── Provider validation ─────────────────────────────────────────────────────

function validateProvider(p, origin) {
  const where = origin ? ` (from ${origin})` : '';
  if (!p || typeof p !== 'object') throw new Error(`Invalid provider${where}: expected an object`);
  if (!KINDS.includes(p.kind)) {
    throw new Error(`Provider '${p.name}'${where}: kind must be one of ${KINDS.join(', ')}`);
  }
  if (!p.name || !/^[a-z0-9][a-z0-9-]*$/.test(p.name)) {
    throw new Error(`Provider${where}: name must be kebab-case (got '${p.name}')`);
  }
  if (p.kind !== 'grid' && typeof p.publish !== 'function') {
    throw new Error(`Provider '${p.name}'${where}: a ${p.kind} provider must implement publish(run, ctx)`);
  }
  return p;
}

/** Default implementation: configured when every env.required variable is set. */
function isConfigured(provider, env) {
  if (typeof provider.isConfigured === 'function') return Boolean(provider.isConfigured(env));
  const required = (provider.env && provider.env.required) || [];
  return required.every((k) => Boolean(env[k]));
}

function missingEnv(provider, env) {
  const required = (provider.env && provider.env.required) || [];
  return required.filter((k) => !env[k]);
}

// ── Registry ────────────────────────────────────────────────────────────────

/**
 * @param {{env?: NodeJS.ProcessEnv, rootDir?: string, config?: object}} [options]
 */
function createRegistry(options = {}) {
  const env = options.env || process.env;
  const rootDir = options.rootDir || ROOT_DIR;
  const config = options.config || loadConfigFile(rootDir);

  const providers = new Map(); // key: `${kind}:${name}`
  for (const p of BUILTIN) providers.set(`${p.kind}:${p.name}`, validateProvider(p, 'builtin'));

  const pluginPaths = [
    ...(Array.isArray(config.plugins) ? config.plugins : []),
    ...splitList(env.PEK_PLUGINS),
  ];
  for (const rel of pluginPaths) {
    const file = path.isAbsolute(rel) ? rel : path.join(rootDir, rel);
    // eslint-disable-next-line import/no-dynamic-require
    const exported = require(file);
    for (const p of Array.isArray(exported) ? exported : [exported]) {
      validateProvider(p, rel);
      providers.set(`${p.kind}:${p.name}`, p); // a plugin may override a builtin
    }
  }

  const list = (kind) => [...providers.values()].filter((p) => !kind || p.kind === kind);
  const get = (kind, name) => providers.get(`${kind}:${name}`);

  function selection(kind) {
    const fromEnv = env[SELECTION_ENV[kind]];
    if (fromEnv && fromEnv.trim()) return { value: fromEnv.trim(), source: SELECTION_ENV[kind] };
    const fromCfg = config[SELECTION_CONFIG[kind]];
    if (fromCfg !== undefined && fromCfg !== null && fromCfg !== '') {
      return {
        value: Array.isArray(fromCfg) ? fromCfg.join(',') : String(fromCfg),
        source: 'pek.config.js',
      };
    }
    return { value: 'auto', source: 'default' };
  }

  /**
   * @param {{requireConfigured?: boolean}} [opts] requireConfigured (default true)
   *   fails fast when an explicitly selected grid lacks its credentials. The
   *   publication engine passes false: it only needs the grid to DESCRIBE the
   *   run, and CI steps that publish don't receive the grid credentials.
   */
  function resolveGrid(opts = {}) {
    const requireConfigured = opts.requireConfigured !== false;
    const { value, source } = selection('grid');
    if (value === 'auto') {
      for (const name of GRID_AUTO_ORDER) {
        const p = get('grid', name);
        if (p && isConfigured(p, env)) return p;
      }
      return get('grid', 'local');
    }
    if (value === 'none') return get('grid', 'local');
    const p = get('grid', value);
    if (!p) {
      throw new Error(
        `Unknown grid '${value}' (set by ${source}). Available: ${list('grid').map((g) => g.name).join(', ')}`
      );
    }
    if (requireConfigured && !isConfigured(p, env)) {
      throw new Error(
        `Grid '${value}' (set by ${source}) is not configured: missing ${missingEnv(p, env).join(', ')}. ` +
          'Set these variables or choose another grid (npm run pek:doctor).'
      );
    }
    return p;
  }

  /** Providers selected for a list kind (test-management | publisher). */
  function resolveList(kind, { only, exclude } = {}) {
    const { value, source } = selection(kind);
    let selected;
    if (value === 'none') selected = [];
    else if (value === 'auto') selected = list(kind).filter((p) => p.auto !== false && isConfigured(p, env));
    else {
      selected = splitList(value).map((name) => {
        const p = get(kind, name);
        if (!p) {
          throw new Error(
            `Unknown ${kind} provider '${name}' (set by ${source}). ` +
              `Available: ${list(kind).map((x) => x.name).join(', ')}`
          );
        }
        return p;
      });
    }
    if (only && only.length) {
      selected = only
        .map((name) => get(kind, name))
        .filter(Boolean);
    }
    if (exclude && exclude.length) selected = selected.filter((p) => !exclude.includes(p.name));
    return selected;
  }

  /** Read-only view used by `pek doctor` and the MCP server. */
  function describe() {
    let grid;
    let gridError = null;
    try {
      grid = resolveGrid();
    } catch (err) {
      gridError = err.message;
      grid = { name: null };
    }
    const tm = resolveList('test-management').map((p) => p.name);
    const pub = resolveList('publisher').map((p) => p.name);
    return {
      rootDir,
      configFile: fs.existsSync(path.join(rootDir, 'pek.config.js')) ? 'pek.config.js' : null,
      gridError,
      selection: {
        grid: selection('grid'),
        testManagement: selection('test-management'),
        publishers: selection('publisher'),
      },
      providers: list().map((p) => ({
        kind: p.kind,
        name: p.name,
        label: p.label || p.name,
        description: p.description || '',
        docs: p.docs || null,
        configured: isConfigured(p, env),
        missingEnv: missingEnv(p, env),
        optionalEnv: (p.env && p.env.optional) || [],
        active:
          p.kind === 'grid' ? p.name === grid.name : (p.kind === 'test-management' ? tm : pub).includes(p.name),
      })),
    };
  }

  return { env, rootDir, config, list, get, resolveGrid, resolveList, describe, isConfigured: (p) => isConfigured(p, env), missingEnv: (p) => missingEnv(p, env) };
}

function splitList(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Shortcut used by test-fixtures.js and playwright configs. */
function resolveGrid(options) {
  return createRegistry(options).resolveGrid();
}

module.exports = { createRegistry, resolveGrid, loadConfigFile, splitList, KINDS, ROOT_DIR };
