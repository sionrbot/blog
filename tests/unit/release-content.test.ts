import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import {
  checkContentHistory,
  isContentChange,
  parseContentDiff,
  validateContentChanges,
} from '../../scripts/release-content';

const modified = {
  path: 'src/content/blog/post.mdx',
  status: 'M',
  beforeMode: '100644',
  afterMode: '100644',
};
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});
function repository() {
  const cwd = mkdtempSync(join(tmpdir(), 'release-content-'));
  directories.push(cwd);
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q');
  git('config', 'user.email', 'fixture@example.test');
  git('config', 'user.name', 'Fixture');
  const put = (path: string, content: string) => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), content);
  };
  const commit = () => {
    git('add', '.');
    git('commit', '-qm', 'fixture');
    return git('rev-parse', 'HEAD');
  };
  put('package.json', '{"version":"2.0.0"}');
  put('src/content/pages/about.mdx', 'About');
  const baseline = commit();
  return { cwd, git, put, commit, baseline };
}

describe('content scope', () => {
  it.each([
    'src/content/blog/post.md',
    'src/content/blog/nested/post.mdx',
    'src/assets/content/photo.avif',
    'src/content/pages/about.mdx',
  ])('allows %s', (path) => {
    expect(isContentChange({ ...modified, path })).toBe(true);
  });
  it.each([
    'src/config.ts',
    'src/assets/logo.svg',
    'src/assets/content/icon.svg',
    'src/content/pages/new.mdx',
    'src/content/blog/../config.md',
    'src/content/blog/a\nb.md',
    'docs/content.md',
  ])('rejects %s', (path) => {
    expect(isContentChange({ ...modified, path })).toBe(false);
  });
  it('rejects fixed-page creation/deletion, links and submodules on either side', () => {
    for (const change of [
      { ...modified, path: 'src/content/pages/about.mdx', status: 'A', beforeMode: '000000' },
      { ...modified, path: 'src/content/pages/about.mdx', status: 'D', afterMode: '000000' },
      { ...modified, beforeMode: '120000' },
      { ...modified, afterMode: '120000' },
      { ...modified, beforeMode: '160000' },
      { ...modified, afterMode: '160000' },
    ])
      expect(isContentChange(change)).toBe(false);
  });
  it('allows restoring the baseline but not notices alone', () => {
    expect(() => validateContentChanges([])).not.toThrow();
    expect(() => validateContentChanges([{ ...modified, path: 'THIRD-PARTY-NOTICES.md' }])).toThrow(
      'Notices alone',
    );
    expect(() =>
      validateContentChanges([modified, { ...modified, path: 'THIRD-PARTY-NOTICES.md' }]),
    ).not.toThrow();
  });
  it('fails closed on truncated or unsupported raw records', () => {
    expect(() => parseContentDiff(':100644')).toThrow();
    expect(() =>
      parseContentDiff(':100644 100644 ' + 'a'.repeat(40) + ' ' + 'b'.repeat(40) + ' R100\0a\0b\0'),
    ).toThrow();
  });
});

describe('cumulative git qualification', () => {
  it('accepts sequential content changes, deletion and a full return to the software baseline', () => {
    const r = repository();
    r.put('src/content/blog/post.mdx', 'Article');
    const first = r.commit();
    expect(() => checkContentHistory(r.cwd, r.baseline, first)).not.toThrow();
    r.put('src/assets/content/photo.png', 'fixture');
    r.put('src/content/blog/post.mdx', 'Revised');
    const second = r.commit();
    expect(() => checkContentHistory(r.cwd, r.baseline, second)).not.toThrow();
    rmSync(join(r.cwd, 'src/content/blog/post.mdx'));
    const third = r.commit();
    expect(() => checkContentHistory(r.cwd, r.baseline, third)).not.toThrow();
    rmSync(join(r.cwd, 'src/assets/content/photo.png'));
    expect(() => checkContentHistory(r.cwd, r.baseline, r.commit())).not.toThrow();
  });
  it('catches a software change hidden before the final content commit and a rename into content', () => {
    const r = repository();
    r.put('src/config.ts', 'export const changed = true;');
    r.commit();
    r.put('src/content/blog/post.mdx', 'Article');
    expect(() => checkContentHistory(r.cwd, r.baseline, r.commit())).toThrow('src/config.ts');
    const beforeMove = r.git('rev-parse', 'HEAD');
    r.git('mv', 'src/config.ts', 'src/content/blog/moved.md');
    expect(() => checkContentHistory(r.cwd, beforeMove, r.commit())).toThrow('src/config.ts');
  });
  it('rejects symlink content and disconnected or missing history', () => {
    const r = repository();
    mkdirSync(join(r.cwd, 'src/content/blog'), { recursive: true });
    symlinkSync('../../../package.json', join(r.cwd, 'src/content/blog/link.md'));
    const linked = r.commit();
    expect(() => checkContentHistory(r.cwd, r.baseline, linked)).toThrow('scope');
    expect(() => checkContentHistory(r.cwd, linked, r.baseline)).toThrow();
    expect(() => checkContentHistory(r.cwd, 'a'.repeat(40), linked)).toThrow();
    writeFileSync(join(r.cwd, '.git/shallow'), linked + '\n');
    expect(() => checkContentHistory(r.cwd, r.baseline, linked)).toThrow('complete history');
  });
});
