import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Root of the Playwright Enterprise Kit repository.
 * Defaults to the parent directory of `mcp-server/` (i.e. the repo root),
 * can be overridden with the PEK_ROOT environment variable.
 */
export const PEK_ROOT: string = process.env.PEK_ROOT
  ? path.resolve(process.env.PEK_ROOT)
  : path.resolve(__dirname, "..", "..");

/** Maximum characters returned to the client for command output. */
export const CHARACTER_LIMIT = 20_000;

/** Default timeout for a Playwright run (seconds). */
export const DEFAULT_RUN_TIMEOUT_S = 900;

/** Default Xray Cloud endpoint. */
export const DEFAULT_XRAY_ENDPOINT = "xray.cloud.getxray.app";

/**
 * Whitelist for the extraEnv tool parameter. Without it, a caller could set
 * NODE_OPTIONS, PATH or similar and turn a test run into arbitrary code
 * execution. Only kit-relevant variables are allowed through.
 */
export const ALLOWED_EXTRA_ENV =
  /^(BS_[A-Z0-9_]+|LT_(PLATFORM|BROWSER|BROWSER_VERSION|BUILD_NAME|PROJECT_NAME)|PEK_GRID|PEK_GRID_WORKERS|PEK_TEST_SCOPE|DEVICE_NAME|BASE_URL|HEADLESS|TEST_TIMEOUT|BROWSERSTACK_BUILD_NAME)$/;

/**
 * Human-readable version of ALLOWED_EXTRA_ENV for error messages.
 * Credentials (BROWSERSTACK_*, LT_USERNAME, LT_ACCESS_KEY, tokens...) are never
 * accepted: they must come from the MCP client config, not from the model.
 */
export const ALLOWED_EXTRA_ENV_HINT =
  "Only BS_*, LT_PLATFORM/LT_BROWSER/LT_BROWSER_VERSION/LT_BUILD_NAME/LT_PROJECT_NAME, " +
  "PEK_GRID, PEK_GRID_WORKERS, PEK_TEST_SCOPE, DEVICE_NAME, BASE_URL, HEADLESS, TEST_TIMEOUT " +
  "and BROWSERSTACK_BUILD_NAME are allowed.";

export function filterExtraEnv(extraEnv: Record<string, string> | undefined): {
  env: Record<string, string>;
  rejected: string[];
} {
  const env: Record<string, string> = {};
  const rejected: string[] = [];
  for (const [key, value] of Object.entries(extraEnv ?? {})) {
    if (ALLOWED_EXTRA_ENV.test(key)) env[key] = value;
    else rejected.push(key);
  }
  return { env, rejected };
}

export function truncate(text: string, limit: number = CHARACTER_LIMIT): string {
  if (text.length <= limit) return text;
  return (
    text.slice(0, limit) +
    `\n\n[... output truncated: ${text.length - limit} characters omitted ...]`
  );
}
