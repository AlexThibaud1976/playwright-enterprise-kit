/** Type declarations for integrations/index.js (subset used from TypeScript). */
export interface GridProvider {
  kind: 'grid';
  name: string;
  label?: string;
  playwrightConfig?: string;
  connectOptions?: (env: NodeJS.ProcessEnv) => { wsEndpoint: string; headers?: Record<string, string> };
  createFixtures(): unknown;
  describeTarget?(env: NodeJS.ProcessEnv): Record<string, string | null>;
}

export function resolveGrid(options?: { env?: NodeJS.ProcessEnv; rootDir?: string }): GridProvider;
export function createRegistry(options?: { env?: NodeJS.ProcessEnv; rootDir?: string; config?: object }): any;
export function splitList(value: string | undefined): string[];
export const KINDS: string[];
export const ROOT_DIR: string;
