import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const rootDocuments = new Set(['README.md', 'AGENTS.md', 'GLOSSARY.md', 'THIRD-PARTY-NOTICES.md']);

export function isDevelopmentDocument(path: string): boolean {
  if (/[\\\r\n]/u.test(path) || path.split('/').some((part) => ['', '.', '..'].includes(part)))
    return false;
  return rootDocuments.has(path) || (path.startsWith('docs/') && path.endsWith('.md'));
}

export function detectCiScope(
  cwd: string,
  eventName: string | undefined,
  eventPath: string | undefined,
  warn: (message: string) => void = console.warn,
): 'docs' | 'full' {
  if (eventName !== 'pull_request') return 'full';
  try {
    if (!eventPath) throw new Error('Missing pull request event');
    const event = JSON.parse(readFileSync(eventPath, 'utf8')) as {
      pull_request?: { base?: { sha?: unknown }; head?: { sha?: unknown } };
    } | null;
    const base = event?.pull_request?.base?.sha;
    const head = event?.pull_request?.head?.sha;
    if (
      typeof base !== 'string' ||
      typeof head !== 'string' ||
      !/^[a-f0-9]{40}$/u.test(base) ||
      !/^[a-f0-9]{40}$/u.test(head)
    )
      throw new Error('Missing pull request commit identities');
    const git = (...args: string[]) =>
      execFileSync('git', ['-c', `safe.directory=${realpathSync(cwd)}`, ...args], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 10_000,
        maxBuffer: 8 * 1024 * 1024,
      });
    const parents = git('rev-list', '--parents', '-n', '1', 'HEAD').trim().split(' ');
    if (parents.length !== 3 || parents[1] !== base || parents[2] !== head)
      throw new Error('Checkout does not match the pull request merge parents');
    // Compare the whole proposed merge with its base, not only the latest commit.
    // Disable rename detection so moving code into docs still includes the old path.
    const diff = git('diff', '--name-only', '--no-renames', '-z', 'HEAD^1', 'HEAD', '--');
    if (!diff.endsWith('\0')) return 'full';
    const paths = diff.slice(0, -1).split('\0');
    return paths.every(isDevelopmentDocument) ? 'docs' : 'full';
  } catch {
    warn('Could not establish a complete documentation-only change; running full verification.');
    return 'full';
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const scope = detectCiScope(
    process.cwd(),
    process.env.GITHUB_EVENT_NAME,
    process.env.GITHUB_EVENT_PATH,
  );
  if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required');
  appendFileSync(process.env.GITHUB_OUTPUT, `scope=${scope}\n`);
  console.log(`CI verification scope: ${scope}`);
}
