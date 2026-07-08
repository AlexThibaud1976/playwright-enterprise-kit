import { spawn } from "node:child_process";
import { PEK_ROOT } from "../constants.js";

export interface ExecResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

/**
 * Runs a command from the kit root and captures stdout/stderr.
 * Never throws on non-zero exit codes: callers decide how to report failure,
 * which lets tools return actionable error messages instead of raw exceptions.
 */
export function runCommand(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
  } = {}
): Promise<ExecResult> {
  const { cwd = PEK_ROOT, env = process.env, timeoutMs = 120_000 } = options;

  return new Promise((resolve) => {
    const started = Date.now();
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const child = spawn(command, args, {
      cwd,
      env,
      shell: process.platform === "win32", // npx/node resolution on Windows
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        exitCode: null,
        stdout,
        stderr: `${stderr}\nFailed to start process '${command}': ${err.message}`,
        timedOut,
        durationMs: Date.now() - started,
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: code,
        stdout,
        stderr,
        timedOut,
        durationMs: Date.now() - started,
      });
    });
  });
}

/**
 * Extracts the last JSON object printed on stdout.
 * Several kit scripts (e.g. resolve-browserstack-config.js) print a JSON
 * payload as their final line for machine parsing.
 */
export function parseLastJsonLine<T>(stdout: string): T | null {
  const lines = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.startsWith("{") && line.endsWith("}")) {
      try {
        return JSON.parse(line) as T;
      } catch {
        /* keep scanning upwards */
      }
    }
  }
  return null;
}
