import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';

export interface ContentChange {
  path: string;
  status: string;
  beforeMode: string;
  afterMode: string;
}

export function isContentChange(change: ContentChange): boolean {
  const { path, status, beforeMode, afterMode } = change;
  if (/[\\\r\n\0]/u.test(path) || path.split('/').some((part) => ['', '.', '..'].includes(part)))
    return false;
  if (!['A', 'M', 'D'].includes(status)) return false;
  const regular = (mode: string) => mode === '100644' || mode === '100755';
  if (status === 'A' && (beforeMode !== '000000' || !regular(afterMode))) return false;
  if (status === 'D' && (!regular(beforeMode) || afterMode !== '000000')) return false;
  if (status === 'M' && (!regular(beforeMode) || !regular(afterMode))) return false;
  if (/^src\/content\/blog\/.+\.mdx?$/u.test(path)) return true;
  if (/^src\/assets\/content\/.+\.(png|jpe?g|webp|avif|gif)$/u.test(path)) return true;
  return (
    status === 'M' &&
    (['about', 'privacy', 'terms'].some((name) => path === `src/content/pages/${name}.mdx`) ||
      path === 'THIRD-PARTY-NOTICES.md')
  );
}

export function validateContentChanges(changes: ContentChange[]): void {
  for (const change of changes) {
    if (!isContentChange(change))
      throw new Error(`Outside content deployment scope: ${change.path}`);
  }
  if (changes.length && changes.every(({ path }) => path === 'THIRD-PARTY-NOTICES.md'))
    throw new Error('Notices alone cannot create a content candidate');
  // An empty cumulative diff is valid when reverting deployed content to the software baseline.
}

export function parseContentDiff(raw: string): ContentChange[] {
  if (!raw) return [];
  if (!raw.endsWith('\0')) throw new Error('Incomplete content diff');
  const fields = raw.slice(0, -1).split('\0');
  if (fields.length % 2) throw new Error('Malformed content diff');
  const changes: ContentChange[] = [];
  for (let i = 0; i < fields.length; i += 2) {
    const match = /^:(\d{6}) (\d{6}) [a-f0-9]{40} [a-f0-9]{40} ([AMD])$/u.exec(fields[i]!);
    if (!match) throw new Error('Unsupported content diff entry');
    changes.push({
      beforeMode: match[1]!,
      afterMode: match[2]!,
      status: match[3]!,
      path: fields[i + 1]!,
    });
  }
  return changes;
}

export function checkContentHistory(cwd: string, baseline: string, sha: string): void {
  if (![baseline, sha].every((value) => /^[a-f0-9]{40}$/u.test(value)))
    throw new Error('Content history requires complete commit SHAs');
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', `safe.directory=${realpathSync(cwd)}`, ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
      maxBuffer: 16 * 1024 * 1024,
    });
  if (git('rev-parse', '--is-shallow-repository').trim() !== 'false')
    throw new Error('Content qualification requires complete history');
  git('merge-base', '--is-ancestor', baseline, sha);
  const changes = parseContentDiff(
    git('diff', '--raw', '--no-abbrev', '--no-renames', '--no-ext-diff', '-z', baseline, sha, '--'),
  );
  validateContentChanges(changes);
}
