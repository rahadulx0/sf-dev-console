import { spawn } from 'node:child_process';

export class CliError extends Error {
  constructor(message: string, public readonly details = '', public readonly exitCode: number | null = null) { super(message) }
}

export class CliRunner {
  async execute(args: string[], options: { timeoutMs?: number; stdin?: string; cwd?: string } = {}) {
    if (args.some((arg) => arg.includes('\0'))) throw new CliError('Invalid CLI argument');
    const timeoutMs = options.timeoutMs ?? 120_000;
    return await new Promise<any>((resolve, reject) => {
      const child = spawn('sf', [...args, '--json'], { shell: false, cwd: options.cwd, env: { ...process.env, SF_DISABLE_TELEMETRY: 'true' } });
      let stdout = ''; let stderr = ''; let settled = false;
      const timer = setTimeout(() => { child.kill('SIGTERM'); fail(new CliError('Salesforce CLI command timed out', stderr)); }, timeoutMs);
      const fail = (error: Error) => { if (!settled) { settled = true; clearTimeout(timer); reject(error); } };
      child.on('error', (error) => fail(new CliError(error.message)));
      child.stdout.on('data', (data) => { stdout += data; });
      child.stderr.on('data', (data) => { stderr += data; });
      if (options.stdin !== undefined) { child.stdin.write(options.stdin); child.stdin.end(); }
      child.on('close', (code) => {
        if (settled) return; settled = true; clearTimeout(timer);
        let parsed: any;
        try { parsed = JSON.parse(stdout); } catch { return reject(new CliError(stderr.trim() || stdout.trim() || 'Invalid response from Salesforce CLI', stderr, code)); }
        if (code !== 0 || parsed.status) return reject(new CliError(parsed.message || 'Salesforce CLI command failed', parsed.stack || stderr, code));
        resolve(parsed.result);
      });
    });
  }

  async version() {
    return await new Promise<string>((resolve, reject) => {
      const child = spawn('sf', ['--version'], { shell: false, env: { ...process.env, SF_DISABLE_TELEMETRY: 'true' } });
      let output = ''; let error = '';
      child.stdout.on('data', (d) => output += d); child.stderr.on('data', (d) => error += d);
      child.on('error', reject); child.on('close', (code) => code === 0 ? resolve(output.trim()) : reject(new Error(error.trim() || 'Salesforce CLI not found')));
    });
  }

}
