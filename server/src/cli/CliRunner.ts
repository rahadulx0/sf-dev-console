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
        env: { ...process.env, SF_DISABLE_TELEMETRY: 'true' },
      });
      let stdout = '';
      let stderr = '';
      let settled = false;
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        fail(new CliError('Salesforce CLI command timed out', stderr));
      }, timeoutMs);
      const onAbort = () => {
        child.kill('SIGTERM');
        fail(new CliError('Salesforce CLI command cancelled', stderr));
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
      child.stdout.on('data', (data) => { stdout += data; });
      child.stderr.on('data', (data) => { stderr += data; });
      if (options.stdin !== undefined) {
        child.stdin.write(options.stdin);
        child.stdin.end();
      }
      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        cleanup();
        let parsed: any;
        try {
          parsed = JSON.parse(stdout);
        } catch {
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
      const child = spawn(SF_EXECUTABLE, ['--version'], { shell: false, env: { ...process.env, SF_DISABLE_TELEMETRY: 'true' } });
      let output = '';
      let error = '';
      child.stdout.on('data', (d) => { output += d; });
      child.stderr.on('data', (d) => { error += d; });
      child.on('error', reject);
      child.on('close', (code) => (code === 0 ? resolve(output.trim()) : reject(new Error(error.trim() || 'Salesforce CLI not found'))));
    });
  }
}
