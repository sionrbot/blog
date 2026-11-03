import { createFixture } from '../support/build-fixture.ts';
import { startDev } from '../support/dev-server.ts';

const fixture = await createFixture('interruption-probe', { posts: [] });
process.send?.({ phase: 'created', root: fixture.root, reportDir: fixture.reportDir });
try {
  const result = await fixture.build();
  if (result.code !== 0) throw new Error(result.stderr);
  const server = process.argv.includes('--dev') ? await startDev(fixture) : undefined;
  process.send?.({
    phase: 'ready',
    root: fixture.root,
    reportDir: fixture.reportDir,
    url: server?.url,
  });
  // Keep the assertion phase alive until the parent sends the interruption signal.
  await new Promise<void>(() => {
    setInterval(() => {}, 1000);
  });
} finally {
  await fixture.dispose();
}
