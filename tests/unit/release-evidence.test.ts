import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vite-plus/test';
import { sha256, type ReleaseEvidence } from '../../scripts/release-evidence';

const script = fileURLToPath(new URL('../../scripts/release-evidence.ts', import.meta.url));
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'release-evidence-'));
  roots.push(root);
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim();
  git('init', '--quiet');
  await writeFile(join(root, 'package.json'), '{"version":"1.8.0"}\n');
  git('add', 'package.json');
  git(
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'fixture',
  );
  const event = {
    pull_request: {
      number: 42,
      base: { ref: 'main' },
      head: {
        ref: 'release-please--branches--main--components--sionrbot-blog',
        sha: git('rev-parse', 'HEAD'),
        repo: { full_name: 'sionrbot/blog' },
      },
    },
  };
  const eventPath = join(root, 'event.json');
  await writeFile(eventPath, JSON.stringify(event));
  const output = join(root, 'bundle');
  await mkdir(output);
  await writeFile(join(output, 'pages.tar'), 'pages bytes');
  await writeFile(join(output, 'workers.tar'), 'workers bytes');
  const run = (kind: string, env: Record<string, string> = {}) =>
    execFileSync(process.execPath, [script, kind, output], {
      cwd: root,
      stdio: 'pipe',
      env: {
        ...process.env,
        GITHUB_EVENT_NAME: 'pull_request',
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_REPOSITORY: 'sionrbot/blog',
        GITHUB_RUN_ID: '101',
        GITHUB_RUN_ATTEMPT: '2',
        ...env,
      },
    });
  const evidence = async () =>
    JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8')) as ReleaseEvidence;
  return { root, git, event, eventPath, output, run, evidence };
}

it('records real checked-out tree and exact archive bytes using the Node CLI', async () => {
  const f = await fixture();
  f.run('bundle');
  expect(await f.evidence()).toEqual({
    schema: 1,
    kind: 'bundle',
    repository: 'sionrbot/blog',
    pullRequest: 42,
    headSha: f.event.pull_request.head.sha,
    testedSha: f.git('rev-parse', 'HEAD'),
    tree: f.git('rev-parse', 'HEAD^{tree}'),
    runId: 101,
    runAttempt: 2,
    version: '1.8.0',
    files: {
      'pages.tar': sha256(Buffer.from('pages bytes')),
      'workers.tar': sha256(Buffer.from('workers bytes')),
    },
  });
});

it('records E2E evidence without claiming production archives', async () => {
  const f = await fixture();
  f.run('e2e');
  expect(await f.evidence()).toMatchObject({ kind: 'e2e', files: {} });
});

it('refuses evidence from manual runs or foreign PR branches', async () => {
  const f = await fixture();
  expect(() => f.run('bundle', { GITHUB_EVENT_NAME: 'workflow_dispatch' })).toThrow();
  f.event.pull_request.head.repo.full_name = 'fork/blog';
  await writeFile(f.eventPath, JSON.stringify(f.event));
  expect(() => f.run('bundle')).toThrow();
  await expect(readFile(join(f.output, 'manifest.json'))).rejects.toThrow();
});

it('refuses to certify tracked content changed after checkout', async () => {
  const f = await fixture();
  await writeFile(join(f.root, 'package.json'), '{"version":"9.9.9"}\n');
  expect(() => f.run('bundle')).toThrow();
  await expect(readFile(join(f.output, 'manifest.json'))).rejects.toThrow();
});
