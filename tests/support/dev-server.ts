import { setTimeout as delay } from 'node:timers/promises';
import type { BuildFixture } from './build-fixture.ts';

/** Uses the CLI's OS-assigned port and waits for a real HTTP response, not only a log line. */
export async function startDev(fixture: BuildFixture, base = '/') {
  const process = fixture.startProcess(['dev', '--host', '127.0.0.1', '--port', '0'], 'dev.log');
  const deadline = Date.now() + 60_000;
  try {
    while (Date.now() < deadline) {
      if (process.closed) {
        await process.result;
        throw new Error(`Dev server exited before ready:\n${process.stdout}\n${process.stderr}`);
      }
      const url = process.stdout.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
      if (url) {
        try {
          const response = await fetch(`${url}${base}`, { signal: AbortSignal.timeout(2_000) });
          if (response.ok) return { url, stop: process.stop };
        } catch {
          // The port may be announced before the initial content sync finishes.
        }
      }
      await delay(100);
    }
    throw new Error(`Dev server not ready after 60 seconds; see ${fixture.reportDir}`);
  } catch (error) {
    await process.stop();
    throw error;
  }
}
