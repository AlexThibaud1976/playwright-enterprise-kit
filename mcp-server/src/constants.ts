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

export function truncate(text: string, limit: number = CHARACTER_LIMIT): string {
  if (text.length <= limit) return text;
  return (
    text.slice(0, limit) +
    `\n\n[... output truncated: ${text.length - limit} characters omitted ...]`
  );
}
