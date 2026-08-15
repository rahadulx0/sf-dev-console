declare module 'cross-spawn' {
  import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'node:child_process';

  export default function spawn(
    command: string,
    args?: readonly string[],
    options?: SpawnOptionsWithoutStdio,
  ): ChildProcessWithoutNullStreams;
}
