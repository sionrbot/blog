import { spawn } from 'node:child_process';
import { access, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { test, expect } from 'vite-plus/test';
import { projectRoot } from '../../support/build-fixture';
import { withDeadline } from '../../support/astro-process';

interface Ready {
  phase: 'created' | 'ready';
  root: string;
  reportDir: string;
  url?: string;
}

test.each([
  { signal: 'SIGTERM', dev: false, code: 143 },
  { signal: 'SIGINT', dev: true, code: 130 },
] as const)(
  'cleans the fixture on $signal after build (dev=$dev)',
  async ({ signal, dev, code }) => {
    const child = spawn(
      process.execPath,
      [join(projectRoot, 'tests/fixtures/interruption-worker.ts'), ...(dev ? ['--dev'] : [])],
      { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] },
    );
    let output = '';
    child.stdout?.on('data', (chunk) => {
      output += chunk;
    });
    child.stderr?.on('data', (chunk) => {
      output += chunk;
    });
    const exited = new Promise<{ code: number | null; signal: string | null }>((resolve) =>
      child.on('exit', (code, signal) => resolve({ code, signal })),
    );
    let ready: Ready | undefined;
    let created: Ready | undefined;
    child.on('message', (value) => {
      created = value as Ready;
    });
    try {
      ready = await withDeadline(
        new Promise<Ready>((resolve, reject) => {
          child.on('message', (value) => {
            const message = value as Ready;
            if (message.phase === 'ready') resolve(message);
          });
          child.once('error', reject);
          child.once('exit', () => reject(new Error(`Probe exited before ready: ${output}`)));
        }),
        90_000,
        'Interruption probe readiness',
      );
      child.kill(signal);
      const result = await withDeadline(exited, 35_000, 'Fixture interruption cleanup');
      await expect(access(ready.root)).rejects.toThrow();
      expect(result, output).toEqual({ code, signal: null });
      for (const file of ['resolved-config.json', 'resolved-vite.json']) {
        expect(JSON.parse(await readFile(join(ready.reportDir, file), 'utf8'))).toHaveProperty(
          'root',
        );
      }
      expect(await readFile(join(ready.reportDir, 'build.log'), 'utf8')).toContain('exit=0');
      if (ready.url) {
        expect(await readFile(join(ready.reportDir, 'dev.log'), 'utf8')).toContain(
          'process signal=',
        );
        await expect(fetch(ready.url, { signal: AbortSignal.timeout(2000) })).rejects.toThrow();
      }
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
        try {
          await withDeadline(exited, 35_000, 'Probe cleanup after failure');
        } catch {
          child.kill('SIGKILL');
        }
      }
      await withDeadline(exited, 5000, 'Probe termination');
      if (created) await rm(created.root, { recursive: true, force: true });
    }
  },
);
