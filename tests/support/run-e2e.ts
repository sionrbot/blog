import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { access, appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { dirname, join } from 'node:path';
import { load } from 'cheerio';
import { projectRoot, type BuildFixture } from './build-fixture.ts';
import { ownFixture } from './fixture-lifecycle.ts';
import { prepareE2EVariant } from './e2e-variants.ts';
import type { E2EManifest } from './e2e-targets.ts';

const args = process.argv.slice(2);
const entry = args.shift();
const mode = entry === 'visual' ? 'ai' : entry;
if (args[0] === '--') args.shift();
if (mode !== 'ai' && mode !== 'deterministic')
  throw new Error('Expected deterministic, ai or visual');
let variant: E2EManifest['variant'] = mode === 'ai' ? 'rendering' : 'default';
const forwarded: string[] = [];
let list = false;
const valueFlags = new Set([
  '--target',
  '--grep',
  '--grep-invert',
  '--tag',
  '--exclude-tag',
  '--repeat-each',
  '--max-failures',
  '--max-duration',
  '--action-timeout',
  '--assertion-timeout',
  '--retries',
]);
const switches = new Set(['--no-cache', '--strict-cache', '--headed', '--debug', '--ai-trace']);
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--variant') {
    const value = args[++i];
    if (
      value !== 'default' &&
      value !== 'rendering' &&
      value !== 'configured-forms' &&
      value !== 'i18n' &&
      value !== 'production-path'
    )
      throw new Error('Unknown variant');
    variant = value;
  } else if (arg === '--list') list = true;
  else if (valueFlags.has(arg)) {
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
    forwarded.push(arg, value);
  } else if (switches.has(arg) || /^tests\/e2e\/[\w/.-]+\.e2e\.ts(?::\d+)?$/.test(arg))
    forwarded.push(arg);
  else throw new Error(`Unsupported argument: ${arg}`);
}
if (entry === 'visual' && variant !== 'rendering')
  throw new Error('The visual entry supports only the rendering variant');
if (mode === 'ai' && (variant === 'i18n' || variant === 'production-path'))
  throw new Error(`${variant} is a deterministic-only variant`);
// WebKit is explicitly selectable; the everyday default is Chromium at two widths.
if (!forwarded.includes('--target'))
  forwarded.push('--target', variant === 'production-path' ? 'desktop' : 'desktop,narrow');
if (
  variant === 'production-path' &&
  forwarded.some((arg, index) => arg === '--target' && forwarded[index + 1] !== 'desktop')
)
  throw new Error('production-path supports only the desktop target');
// Container checkout ownership may differ; trust only this invocation's project root.
// Git 2.43 compares this literally, so resolve symlinks and the URL's trailing slash.
const gitArgs = ['-c', `safe.directory=${realpathSync(projectRoot)}`];
const sourceSha = execFileSync('git', [...gitArgs, 'rev-parse', 'HEAD'], {
  cwd: projectRoot,
  encoding: 'utf8',
}).trim();
const sourceDirty =
  execFileSync('git', [...gitArgs, 'status', '--porcelain'], {
    cwd: projectRoot,
    encoding: 'utf8',
  }).trim() !== '';
const reportDir = join(projectRoot, '.e2e', 'runs', `${Date.now()}-${randomUUID()}`, mode, variant);
await mkdir(reportDir, { recursive: true });
console.log(`E2E diagnostics: ${reportDir}`);
let fixture: BuildFixture | undefined;
let runner: ReturnType<typeof spawn> | undefined;
let runnerDone: Promise<number> | undefined;
let release: (() => void) | undefined;
let cleanup: Promise<void> | undefined;
let shuttingDown = false;
const stopRunner = () => {
  shuttingDown = true;
  return (cleanup ??= (async () => {
    if (runner && runner.exitCode === null && runner.signalCode === null) runner.kill('SIGTERM');
    await runnerDone;
  })());
};
const started = performance.now();
try {
  if (variant !== 'default') {
    fixture = await prepareE2EVariant(variant);
    fixture.beforeDispose(stopRunner);
  } else {
    release = ownFixture(stopRunner);
  }
  const root = fixture?.root ?? projectRoot;
  await access(join(root, 'dist/index.html'));
  const siteUrl = fixture
    ? fixture.env.SITE_URL!
    : load(await readFile(join(root, 'dist/index.html'), 'utf8'))('link[rel="canonical"]').attr(
        'href',
      );
  if (!siteUrl) throw new Error('The built home page must declare its canonical deployment URL');
  const deployment = new URL(siteUrl);
  if (!fixture && process.env.SITE_URL) {
    const requested = new URL(process.env.SITE_URL);
    if (
      requested.origin !== deployment.origin ||
      requested.pathname.replace(/\/$/, '') !== deployment.pathname.replace(/\/$/, '')
    )
      throw new Error('SITE_URL does not match root dist; rebuild with the same deployment URL');
  }
  if (shuttingDown) throw new Error('E2E invocation interrupted');
  // All browser targets share one Astro preview (Astro allows one per project).
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = (reservation.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) =>
    reservation.close((error) => (error ? reject(error) : resolve())),
  );
  const manifest: E2EManifest = {
    port,
    mode,
    variant,
    siteUrl,
    sourceSha,
    sourceDirty,
    root,
    dist: join(root, 'dist'),
    reportDir,
    testsGlob: `tests/e2e/${mode}/${variant}/**/*.e2e.ts`,
  };
  const manifestPath = join(reportDir, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  const require = createRequire(import.meta.url);
  const cli = join(dirname(require.resolve('e2e')), 'cli/bin.js');
  const command = [
    cli,
    list ? 'list' : 'run',
    '--config',
    mode === 'ai' ? 'e2e.ai.config.ts' : 'e2e.config.ts',
    ...forwarded,
  ];
  if (shuttingDown) throw new Error('E2E invocation interrupted');
  runner = spawn(process.execPath, command, {
    cwd: projectRoot,
    env: { ...process.env, E2E_RUN_MANIFEST: manifestPath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  for (const [stream, destination] of [
    [runner.stdout!, process.stdout],
    [runner.stderr!, process.stderr],
  ] as const) {
    stream.setEncoding('utf8').on('data', (chunk: string) => {
      output += chunk;
      destination.write(chunk);
    });
  }
  runnerDone = new Promise<number>((resolve, reject) => {
    runner!.once('error', reject);
    runner!.once('close', (code, signal) => resolve(code ?? (signal ? 130 : 3)));
  });
  try {
    process.exitCode = await runnerDone;
  } finally {
    await writeFile(join(reportDir, 'runner.log'), output);
  }
} catch (error) {
  await appendFile(join(reportDir, 'orchestrator.log'), `${String(error)}\n`);
  console.error(error);
  process.exitCode = 3;
} finally {
  try {
    if (fixture) await fixture.dispose();
    else await stopRunner();
  } catch (error) {
    await appendFile(join(reportDir, 'orchestrator.log'), `${String(error)}\n`);
    console.error(error);
    process.exitCode = 3;
  } finally {
    release?.();
    await writeFile(
      join(reportDir, 'result.json'),
      JSON.stringify(
        {
          code: process.exitCode,
          durationMs: performance.now() - started,
          node: process.version,
          sourceSha,
          sourceDirty,
          fixtureReport: fixture?.reportDir,
        },
        null,
        2,
      ),
    );
  }
}
