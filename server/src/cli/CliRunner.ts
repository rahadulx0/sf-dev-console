import spawn from 'cross-spawn';

export class CliError extends Error {
  constructor(message: string, public readonly details = '', public readonly exitCode: number | null = null) {
    super(message);
  }
}

export interface ExecuteOptions {
  timeoutMs?: number;
  stdin?: string;
  cwd?: string;
  /** Aborts the command and kills the child process; used when a client disconnects. */
  signal?: AbortSignal;
  /** Extra environment for this invocation only, merged over the shared CLI environment. */
  env?: NodeJS.ProcessEnv;
  /**
   * Enables in-flight de-duplication and result caching for read-only commands.
   * Never set this for a command that changes org or local state.
   */
  cache?: { key: string; ttlMs: number };
}

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

/** Each `sf` invocation boots a fresh Node runtime, so unbounded fan-out starves the machine. */
const MAX_CONCURRENT = Math.max(1, Number(process.env.SF_CONSOLE_MAX_CLI) || 4);
const SF_EXECUTABLE = 'sf';

/**
 * Dev runners can inject FORCE_COLOR while the Salesforce CLI toolchain injects NO_COLOR.
 * Node warns whenever both are present, polluting command stderr and making real Apex errors
 * unreadable. JSON CLI calls don't need terminal coloring, so pass neither variable through.
 */
function buildBaseEnvironment(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    SF_DISABLE_TELEMETRY: 'true',
    // Skipping the CLI's own update and autocomplete bookkeeping removes work from every
    // invocation, and each one already costs a full Node boot.
    SF_AUTOUPDATE_DISABLE: 'true',
    SF_SKIP_NEW_VERSION_CHECK: 'true',
    SF_SKIP_VERSION_CHECK: 'true',
  };
  delete env.FORCE_COLOR;
  delete env.NO_COLOR;
  return env;
}

/** Computed once: rebuilding it per invocation copied the whole environment needlessly. */
const BASE_ENV = buildBaseEnvironment();

/**
 * Parses the CLI's JSON result, tolerating anything printed ahead of it.
 *
 * Some commands write a human-facing line to stdout even under `--json`: `apex run` reading
 * from stdin announces "Start typing Apex code…" before its result, which made a strict parse
 * fail and reported that prompt back to the user as the error. Parsing from the first brace
 * recovers the actual payload. Returns `undefined` when there is no JSON at all.
 */
export function parseCliJson(stdout: string): any {
  try {
    return JSON.parse(stdout);
  } catch {
    // Fall through to locating the payload inside the surrounding output.
  }
  const start = stdout.indexOf('{');
  if (start < 0) return undefined;
  try {
    return JSON.parse(stdout.slice(start));
  } catch {
    return undefined;
  }
}

function cliEnvironment(extra?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return extra ? { ...BASE_ENV, ...extra } : BASE_ENV;
}

export class CliRunner {
  private active = 0;
  private readonly queue: (() => void)[] = [];
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<unknown>>();

  async execute(args: string[], options: ExecuteOptions = {}): Promise<any> {
    if (args.some((arg) => arg.includes('\0'))) throw new CliError('Invalid CLI argument');
    const cache = options.cache;
    if (!cache) return await this.schedule(args, options);

    const hit = this.cache.get(cache.key);
    if (hit && hit.expiresAt > Date.now()) return hit.value;

    // A second caller arriving while the first command is still running waits for that
    // result rather than spawning a duplicate process.
    const existing = this.inFlight.get(cache.key);
    if (existing) return await existing;

    const run = this.schedule(args, options)
      .then((value) => {
        this.cache.set(cache.key, { value, expiresAt: Date.now() + cache.ttlMs });
        return value;
      })
      .finally(() => {
        this.inFlight.delete(cache.key);
      });
    this.inFlight.set(cache.key, run);
    return await run;
  }

  /** Drops cached results whose key starts with the given prefix. */
  invalidate(prefix: string) {
    for (const key of this.cache.keys()) if (key.startsWith(prefix)) this.cache.delete(key);
  }

  private async schedule(args: string[], options: ExecuteOptions) {
    await this.acquire();
    try {
      return await this.run(args, options);
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < MAX_CONCURRENT) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.active++;
        resolve();
      });
    });
  }

  private release() {
    this.active--;
    this.queue.shift()?.();
  }

  private run(args: string[], options: ExecuteOptions): Promise<any> {
    const timeoutMs = options.timeoutMs ?? 120_000;
    return new Promise<any>((resolve, reject) => {
      const child = spawn(SF_EXECUTABLE, [...args, '--json'], {
        shell: false,
        cwd: options.cwd,
        env: cliEnvironment(options.env),
      });
      /*
       * Chunks are collected as Buffers and decoded once at the end. Appending
       * `data.toString()` per chunk both re-copies a growing string and can split a
       * multi-byte UTF-8 character across a chunk boundary, corrupting it — a real risk
       * here, where a describe response runs to megabytes.
       */
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      const readStderr = () => Buffer.concat(stderrChunks).toString('utf8');
      let settled = false;
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        fail(new CliError('Salesforce CLI command timed out', readStderr()));
      }, timeoutMs);
      const onAbort = () => {
        child.kill('SIGTERM');
        fail(new CliError('Salesforce CLI command cancelled', readStderr()));
      };
      const cleanup = () => {
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', onAbort);
      };
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };
      if (options.signal) {
        if (options.signal.aborted) {
          child.kill('SIGTERM');
          return fail(new CliError('Salesforce CLI command cancelled'));
        }
        options.signal.addEventListener('abort', onAbort, { once: true });
      }
      child.on('error', (error) => fail(new CliError(error.message)));
      child.stdout.on('data', (data: Buffer) => { stdoutChunks.push(data); });
      child.stderr.on('data', (data: Buffer) => { stderrChunks.push(data); });
      if (options.stdin !== undefined) {
        child.stdin.write(options.stdin);
        child.stdin.end();
      }
      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        cleanup();
        const stdout = Buffer.concat(stdoutChunks).toString('utf8');
        const stderr = readStderr();
        const parsed = parseCliJson(stdout);
        if (!parsed) {
          return reject(new CliError(stderr.trim() || stdout.trim() || 'Invalid response from Salesforce CLI', stderr, code));
        }
        if (code !== 0 || parsed.status) {
          return reject(new CliError(parsed.message || 'Salesforce CLI command failed', parsed.stack || stderr, code));
        }
        resolve(parsed.result);
      });
    });
  }

  async version() {
    return await new Promise<string>((resolve, reject) => {
      const child = spawn(SF_EXECUTABLE, ['--version'], { shell: false, env: cliEnvironment() });
      let output = '';
      let error = '';
      child.stdout.on('data', (d) => { output += d; });
      child.stderr.on('data', (d) => { error += d; });
      child.on('error', reject);
      child.on('close', (code) => (code === 0 ? resolve(output.trim()) : reject(new Error(error.trim() || 'Salesforce CLI not found'))));
    });
  }
}
