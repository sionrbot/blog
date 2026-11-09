import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

interface PullRequest {
  number: number;
  state: string;
  url: string;
  baseRefName: string;
  headRefName: string;
  headRefOid: string;
  mergeCommit: { oid: string } | null;
}

export function repositoryReady(snapshot: {
  clean: boolean;
  localStable: boolean;
  branch: string;
  base: string;
  localBase: string;
  remoteBefore: string;
  remoteAfter: string;
  pr: PullRequest;
  mergeOnBase: boolean;
}): boolean {
  return (
    snapshot.clean &&
    snapshot.localStable &&
    snapshot.branch === snapshot.base &&
    snapshot.localBase === snapshot.remoteBefore &&
    snapshot.remoteBefore === snapshot.remoteAfter &&
    snapshot.pr.state === 'MERGED' &&
    snapshot.pr.baseRefName === snapshot.base &&
    snapshot.mergeOnBase
  );
}

function run(command: string, args: string[]): string {
  return execFileSync(command, args, {
    encoding: 'utf8',
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GH_PROMPT_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
  }).trim();
}

function main(): void {
  const { values } = parseArgs({
    options: {
      pr: { type: 'string' },
      remote: { type: 'string', default: 'origin' },
      base: { type: 'string', default: 'main' },
    },
  });
  if (!values.pr || !/^\d+$/.test(values.pr)) {
    throw new Error(
      'Usage: node scripts/check-closeout.ts --pr NUMBER [--remote origin] [--base main]',
    );
  }
  const remote = values.remote;
  const base = values.base;
  if (remote.startsWith('-') || base.startsWith('-')) throw new Error('Invalid remote or base');
  run('git', ['check-ref-format', `refs/heads/${base}`]);
  const remoteUrl = run('git', ['remote', 'get-url', remote]);
  // Bind GitHub reads to the selected remote, not gh's possibly different default repository.
  const match =
    /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/]+\/[^/]+?)\/?$/.exec(
      remoteUrl,
    );
  if (!match) throw new Error('Expected a github.com remote URL');
  const repository = match[1]!.replace(/\.git$/, '');
  const remoteHead = () => {
    const result = run('git', ['ls-remote', '--exit-code', remote, `refs/heads/${base}`]);
    const sha = result.split(/\s+/)[0];
    if (!sha || !/^[a-f0-9]{40,64}$/.test(sha)) throw new Error('Remote base SHA unavailable');
    return sha;
  };
  const remoteBefore = remoteHead();
  const localBase = run('git', ['rev-parse', '--verify', `refs/heads/${base}`]);
  const branch = run('git', ['branch', '--show-current']);
  const changes = run('git', ['status', '--porcelain=v1', '--untracked-files=all']);
  const pr = JSON.parse(
    run('gh', [
      'pr',
      'view',
      values.pr,
      '--repo',
      repository,
      '--json',
      'number,state,url,baseRefName,headRefName,headRefOid,mergeCommit',
    ]),
  ) as PullRequest;
  let mergeOnBase = false;
  if (pr.mergeCommit) {
    try {
      run('git', ['merge-base', '--is-ancestor', pr.mergeCommit.oid, localBase]);
      mergeOnBase = true;
    } catch (error) {
      if ((error as { status?: number }).status !== 1) throw error;
    }
  }
  const branches = run('git', [
    'for-each-ref',
    '--format=%(refname:short) %(objectname) %(upstream:short)',
    'refs/heads/',
  ]);
  const remoteBranches = run('git', ['ls-remote', '--heads', remote]);
  const workflowRuns = JSON.parse(
    run('gh', [
      'run',
      'list',
      '--repo',
      repository,
      '--commit',
      remoteBefore,
      '--limit',
      '100',
      '--json',
      'databaseId,workflowName,event,headSha,status,conclusion,url',
    ]),
  );
  const localBaseAfter = run('git', ['rev-parse', '--verify', `refs/heads/${base}`]);
  const branchAfter = run('git', ['branch', '--show-current']);
  const changesAfter = run('git', ['status', '--porcelain=v1', '--untracked-files=all']);
  const localStable =
    localBase === localBaseAfter && branch === branchAfter && changes === changesAfter;
  const remoteAfter = remoteHead();
  const snapshot = {
    checkedAt: new Date().toISOString(),
    localStable,
    localBaseAfter,
    branchAfter,
    changesAfter,
    repository,
    remote,
    base,
    branch,
    clean: changes === '',
    changes,
    localBase,
    remoteBefore,
    remoteAfter,
    pr,
    mergeOnBase,
    branches,
    remoteBranches,
    workflowRuns,
  };
  const ready = repositoryReady(snapshot);
  console.log(
    JSON.stringify(
      {
        ...snapshot,
        repositoryReady: ready,
        scope:
          'Repository snapshot only. Review exact-SHA CI, E2E, deployments, release publication and task branch cleanup separately. Runs are limited to 100; absence is not success.',
      },
      null,
      2,
    ),
  );
  process.exitCode = ready ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
    );
    process.exitCode = 2;
  }
}
