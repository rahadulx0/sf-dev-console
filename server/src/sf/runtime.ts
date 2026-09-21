import { CliRunner } from '../cli/CliRunner.js';
import { AuthProvider } from './auth.js';
import { SfApi, shouldFallBack } from './api.js';

/*
 * The shared Salesforce access layer.
 *
 * These three live together because they form one chain: the CLI runner acquires a token, the
 * auth provider keeps it, and the API client spends it. Owning them in a single module keeps
 * the route helpers free of an import cycle.
 */

export const cli = new CliRunner();
export const authProvider = new AuthProvider(cli);
export const sfApi = new SfApi(authProvider);

/** Escape hatch: forces every read back through the CLI, for isolating a fast-path problem. */
const FAST_PATH_DISABLED = process.env.SF_CONSOLE_NO_FAST_PATH === '1' || process.env.SF_CONSOLE_NO_FAST_PATH === 'true';

/**
 * Whether direct-API reads are permitted at all. Callers that reach the API outside
 * `readFast` — the editor, which writes files rather than returning a value — must check this
 * so the escape hatch really does route everything back through the CLI.
 */
export const fastPathEnabled = !FAST_PATH_DISABLED;

const stats = { fast: 0, fallback: 0, cli: 0 };

/**
 * Answers a read through the direct API when possible, and through the CLI when not.
 *
 * The distinction that matters is *why* the fast path failed. A malformed SOQL statement or an
 * unknown field is the org's real answer and is surfaced immediately — replaying it through
 * the CLI would cost seconds and report the same rejection. Anything else (no token, expired
 * session, transport error, the CLI withholding secrets) means the fast path could not answer,
 * so the CLI runs and the user never sees a difference beyond latency.
 */
export async function readFast<T>(direct: () => Promise<T>, viaCli: () => Promise<T>): Promise<T> {
  if (FAST_PATH_DISABLED) {
    stats.cli++;
    return await viaCli();
  }
  try {
    const value = await direct();
    stats.fast++;
    return value;
  } catch (error) {
    if (!shouldFallBack(error)) throw error;
    stats.fallback++;
    return await viaCli();
  }
}

/** Counts of how each read was served. Surfaced by the status endpoint for diagnostics. */
export function fastPathStats() {
  return { ...stats, enabled: !FAST_PATH_DISABLED, available: !FAST_PATH_DISABLED && authProvider.fastPathLikely };
}
