import { spawn } from 'node:child_process';
import { appendFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const astroCli = join(dirname(require.resolve('astro/package.json')), 'bin/astro.mjs');

export interface ProcessResult {
  code: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export function fixtureEnv(demo: boolean): NodeJS.ProcessEnv {
  // Do not inherit SITE_URL, demo flags, NODE_OPTIONS or the test runner's environment.
  const env: NodeJS.ProcessEnv = {};
  for (const key of ['PATH', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot']) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return {
    ...env,
    CI: '1',
    ASTRO_TELEMETRY_DISABLED: '1',
    NO_COLOR: '1',
    SITE_URL: 'https://fixture.example',
    ...(demo ? { PUBLIC_DEMO_BUY_URL: 'https://example.test/buy' } : {}),
  };
}

/** A foreground CLI with bounded shutdown; only signal the process tree we started. */
export function startAstro(root: string, args: string[], env: NodeJS.ProcessEnv, logPath: string) {
  const started = performance.now();
  const child = spawn(process.execPath, [astroCli, ...args, '--config', 'fixture.config.mjs'], {
    cwd: root,
    env,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  let closed = false;
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
  let spawnError: Error | undefined;
  child.on('error', (error) => {
    spawnError = error;
  });
  const exited = new Promise<ProcessResult>((resolve) => {
    child.on('close', (code, signal) => {
      closed = true;
      stderr += `\nprocess signal=${signal}\n`;
      resolve({ code, stdout, stderr, durationMs: performance.now() - started });
    });
  });
  const result = exited.then(async (value) => {
    await mkdir(dirname(logPath), { recursive: true });
    await appendFile(
      logPath,
      `\n$ astro ${args.join(' ')}\n${value.stdout}\n${value.stderr}\nexit=${value.code} durationMs=${value.durationMs}\n`,
    );
    if (spawnError) throw spawnError;
    return value;
  });
  // Attach a handler immediately: spawn failures may precede the caller's await.
  void result.catch(() => {});

  function signalChild(signal: NodeJS.Signals) {
    if (closed || !child.pid) return;
    try {
      if (process.platform === 'win32') child.kill(signal);
      else process.kill(-child.pid, signal);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
  }
  let stopping: Promise<void> | undefined;
  function stop(): Promise<void> {
    stopping ??= (async () => {
      signalChild('SIGTERM');
      try {
        await withDeadline(exited, 5_000, `SIGTERM shutdown: ${root}`);
      } catch {
        signalChild('SIGKILL');
        await withDeadline(exited, 5_000, `SIGKILL shutdown: ${root}`);
      }
      await withDeadline(result, 5_000, `Writing process diagnostics: ${logPath}`);
    })();
    return stopping;
  }

  return {
    result,
    stop,
    get closed() {
      return closed;
    },
    get stdout() {
      return stdout;
    },
    get stderr() {
      return stderr;
    },
  };
}

/** A deadline also bounds diagnostic I/O, not just the child process lifetime. */
export async function withDeadline<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  const controller = new AbortController();
  try {
    return await Promise.race([
      promise,
      delay(timeoutMs, undefined, { signal: controller.signal }).then(() => {
        throw new Error(`${label} exceeded ${timeoutMs}ms`);
      }),
    ]);
  } finally {
    controller.abort();
  }
}
