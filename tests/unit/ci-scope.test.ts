import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, test } from 'vite-plus/test';
import { detectCiScope, isDevelopmentDocument } from '../../scripts/ci-scope';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function repository(
  change: (
    write: (path: string, content?: string) => void,
    git: (...args: string[]) => string,
  ) => void,
) {
  const cwd = mkdtempSync(join(tmpdir(), 'ci-scope-'));
  directories.push(cwd);
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = (path: string, content = 'updated\n') => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), content);
  };
  git('init', '-b', 'main');
  git('config', 'user.name', 'CI scope test');
  git('config', 'user.email', 'ci-scope@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  write('README.md', '# Initial\n');
  write('docs/remove.md', '# Remove\n');
  write('src/example.ts', 'export const value = 1;\n');
  git('add', '.');
  git('commit', '-m', 'base');
  const base = git('rev-parse', 'HEAD');
  git('checkout', '-b', 'topic');
  change(write, git);
  git('add', '-A');
  git('commit', '--allow-empty', '-m', 'topic');
  const head = git('rev-parse', 'HEAD');
  git('checkout', 'main');
  git('merge', '--no-ff', 'topic', '-m', 'merge');
  const eventPath = join(cwd, 'event.json');
  writeFileSync(
    eventPath,
    JSON.stringify({ pull_request: { base: { sha: base }, head: { sha: head } } }),
  );
  return {
    cwd,
    git,
    eventPath,
    scope: () => detectCiScope(cwd, 'pull_request', eventPath, () => {}),
  };
}

describe('development document allowlist', () => {
  test.each([
    'README.md',
    'AGENTS.md',
    'GLOSSARY.md',
    'THIRD-PARTY-NOTICES.md',
    'docs/nested/guide.md',
  ])('%s is documentation', (path) => {
    expect(isDevelopmentDocument(path)).toBe(true);
  });
  test.each([
    'CHANGELOG.md',
    'src/content/blog/post.md',
    'docs/example.ts',
    'docs/page.mdx',
    'new.md',
    'README.MD',
    '/docs/a.md',
    'docs/../src/a.md',
    'docs//a.md',
    'docs\\a.md',
    'docs/a\nb.md',
  ])('%s requires full verification', (path) => {
    expect(isDevelopmentDocument(path)).toBe(false);
  });
});

test('recognizes documentation across the proposed merge', () => {
  expect(repository((write) => write('docs/guide.md')).scope()).toBe('docs');
});

test.each(['src/content/blog/post.md', 'CHANGELOG.md', 'unknown.md', 'src/example.ts'])(
  'keeps full verification for documentation mixed with %s',
  (path) => {
    expect(
      repository((write) => {
        write('README.md');
        write(path);
      }).scope(),
    ).toBe('full');
  },
);

test('includes earlier PR commits, not just the latest documentation commit', () => {
  const repo = repository((write, git) => {
    write('src/example.ts');
    git('add', '.');
    git('commit', '-m', 'code');
    write('README.md');
  });
  expect(repo.scope()).toBe('full');
});

test('handles documentation deletion and rename', () => {
  expect(repository((_write, git) => git('rm', 'docs/remove.md')).scope()).toBe('docs');
  expect(repository((_write, git) => git('mv', 'docs/remove.md', 'docs/renamed.md')).scope()).toBe(
    'docs',
  );
});

test('moving code into documentation still requires full verification', () => {
  expect(repository((_write, git) => git('mv', 'src/example.ts', 'docs/example.md')).scope()).toBe(
    'full',
  );
});

test('manual runs and empty diffs require full verification', () => {
  const repo = repository(() => {});
  expect(repo.scope()).toBe('full');
  expect(detectCiScope(repo.cwd, 'workflow_dispatch', repo.eventPath)).toBe('full');
});

test('mismatched commit identities and malformed events fall back to full verification', () => {
  const repo = repository((write) => write('README.md'));
  writeFileSync(
    repo.eventPath,
    JSON.stringify({
      pull_request: { base: { sha: 'a'.repeat(40) }, head: { sha: 'b'.repeat(40) } },
    }),
  );
  expect(repo.scope()).toBe('full');
  writeFileSync(repo.eventPath, '{broken');
  expect(repo.scope()).toBe('full');
  expect(detectCiScope(repo.cwd, 'pull_request', undefined, () => {})).toBe('full');
});

test('depth two has enough history while depth one falls back', () => {
  const repo = repository((write) => write('README.md'));
  for (const depth of [1, 2]) {
    const clone = mkdtempSync(join(tmpdir(), 'ci-scope-clone-'));
    directories.push(clone);
    execFileSync('git', ['clone', '--depth', String(depth), `file://${repo.cwd}`, clone], {
      stdio: 'pipe',
    });
    expect(detectCiScope(clone, 'pull_request', repo.eventPath, () => {})).toBe(
      depth === 2 ? 'docs' : 'full',
    );
  }
});

test('CLI emits fallback output and fails if it cannot write the required output', () => {
  const repo = repository((write) => write('README.md'));
  const script = fileURLToPath(new URL('../../scripts/ci-scope.ts', import.meta.url));
  const output = join(repo.cwd, 'output');
  const env = {
    ...process.env,
    GITHUB_EVENT_NAME: 'pull_request',
    GITHUB_EVENT_PATH: join(repo.cwd, 'missing'),
    GITHUB_OUTPUT: output,
  };
  expect(spawnSync(process.execPath, [script], { cwd: repo.cwd, env }).status).toBe(0);
  expect(readFileSync(output, 'utf8')).toBe('scope=full\n');
  expect(
    spawnSync(process.execPath, [script], {
      cwd: repo.cwd,
      env: { ...env, GITHUB_OUTPUT: repo.cwd },
    }).status,
  ).not.toBe(0);
});
