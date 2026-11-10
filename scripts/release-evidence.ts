import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface ReleaseEvidence {
  schema: 1;
  kind: 'bundle' | 'e2e';
  repository: string;
  pullRequest: number;
  headSha: string;
  testedSha: string;
  tree: string;
  runId: number;
  runAttempt: number;
  version: string;
  files: Record<string, string>;
}

export function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

export async function writeEvidence(kind: 'bundle' | 'e2e', directory: string): Promise<void> {
  if (process.env.GITHUB_EVENT_NAME !== 'pull_request') {
    throw new Error('Release evidence must come from a pull_request run');
  }
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH!, 'utf8'));
  const pr = event.pull_request;
  const repository = process.env.GITHUB_REPOSITORY!;
  if (
    pr.base.ref !== 'main' ||
    pr.head.ref !== 'release-please--branches--main--components--sionrbot-blog' ||
    pr.head.repo.full_name !== repository
  ) {
    throw new Error('Expected a same-repository Release PR targeting main');
  }
  const git = (ref: string) => execFileSync('git', ['rev-parse', ref], { encoding: 'utf8' }).trim();
  execFileSync('git', ['diff', '--exit-code', 'HEAD', '--'], { stdio: 'pipe' });
  const files: Record<string, string> = {};
  if (kind === 'bundle') {
    for (const name of ['pages.tar', 'workers.tar']) {
      files[name] = sha256(await readFile(join(directory, name)));
    }
  }
  const evidence: ReleaseEvidence = {
    schema: 1,
    kind,
    repository,
    pullRequest: pr.number,
    headSha: pr.head.sha,
    testedSha: git('HEAD'),
    tree: git('HEAD^{tree}'),
    runId: Number(process.env.GITHUB_RUN_ID),
    runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
    version: JSON.parse(await readFile('package.json', 'utf8')).version,
    files,
  };
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'manifest.json'), `${JSON.stringify(evidence, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [kind, directory] = process.argv.slice(2);
  if ((kind !== 'bundle' && kind !== 'e2e') || !directory) {
    throw new Error('Usage: release-evidence.ts <bundle|e2e> DIRECTORY');
  }
  await writeEvidence(kind, directory);
}
