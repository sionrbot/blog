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

export interface ReleaseRun {
  id: number;
  run_attempt: number;
  path: string;
  event: string;
  display_title: string;
  head_sha: string;
  head_branch: string;
  status: string;
  conclusion: string | null;
  html_url: string;
}

export interface ReleaseJob {
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  steps?: { name: string; status: string; conclusion: string | null }[];
}

// The workflow run's head_sha identifies its execution ref, not dispatch input.
// The controlled run-name records the requested candidate; jobs establish whether
// admission, validation, deployment and smoke actually accepted that request.
export function releaseRunSnapshot(run: ReleaseRun, jobs: ReleaseJob[]) {
  const identity = /^(software|content) ([a-f0-9]{40})$/.exec(run.display_title);
  if (
    run.path.split('@')[0] !== '.github/workflows/release.yml' ||
    !identity ||
    !Number.isSafeInteger(run.run_attempt) ||
    run.run_attempt < 1 ||
    (identity[1] === 'content'
      ? run.event !== 'workflow_dispatch' || run.head_branch !== 'release'
      : run.event !== 'pull_request')
  )
    throw new Error('Expected a fixed software/content release workflow run');
  const job = (name: string) => {
    const matches = jobs.filter((entry) => entry.name === name);
    if (matches.length > 1) throw new Error(`Ambiguous ${name} job in current attempt`);
    return matches[0] ?? null;
  };
  return {
    run,
    candidate: { kind: identity[1], sha: identity[2], identitySource: 'workflow run-name' },
    executionSha: run.head_sha,
    preparation: job('prepare'),
    pages: job('pages'),
    workers: job('workers'),
    jobs,
  };
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
      run: { type: 'string' },
      remote: { type: 'string', default: 'origin' },
      base: { type: 'string', default: 'main' },
    },
  });
  if (
    Boolean(values.pr) === Boolean(values.run) ||
    !/^[1-9]\d*$/.test(values.pr ?? values.run ?? '')
  ) {
    throw new Error(
      'Usage: node scripts/check-closeout.ts <--pr NUMBER | --run ID> [--remote origin] [--base main]',
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
  const pr = values.pr
    ? (JSON.parse(
        run('gh', [
          'pr',
          'view',
          values.pr,
          '--repo',
          repository,
          '--json',
          'number,state,url,baseRefName,headRefName,headRefOid,mergeCommit',
        ]),
      ) as PullRequest)
    : null;
  let mergeOnBase = false;
  if (pr?.mergeCommit) {
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
  // PR checks belong to the PR head; release/deploy runs may have another execution SHA.
  // Keep these observations separate instead of requiring post-merge CI reruns.
  const runsByCommit = new Map<string, unknown>();
  const workflowRunsFor = (sha: string) => {
    if (!runsByCommit.has(sha)) {
      runsByCommit.set(
        sha,
        JSON.parse(
          run('gh', [
            'run',
            'list',
            '--repo',
            repository,
            '--commit',
            sha,
            '--limit',
            '100',
            '--json',
            'databaseId,workflowName,event,headSha,status,conclusion,url',
          ]),
        ),
      );
    }
    return runsByCommit.get(sha);
  };
  const workflowRuns = workflowRunsFor(remoteBefore);
  const prWorkflowRuns = pr ? workflowRunsFor(pr.headRefOid) : [];
  const mergeWorkflowRuns = pr?.mergeCommit ? workflowRunsFor(pr.mergeCommit.oid) : [];
  let releaseRun: ReturnType<typeof releaseRunSnapshot> | null = null;
  let candidateOnBase = false;
  if (values.run) {
    const readRun = () =>
      JSON.parse(
        run('gh', ['api', `repos/${repository}/actions/runs/${values.run}`]),
      ) as ReleaseRun;
    const selected = readRun();
    const pages = JSON.parse(
      run('gh', [
        'api',
        '--paginate',
        '--slurp',
        `repos/${repository}/actions/runs/${values.run}/attempts/${selected.run_attempt}/jobs?per_page=100`,
      ]),
    ) as { jobs: ReleaseJob[] }[];
    releaseRun = releaseRunSnapshot(
      selected,
      pages.flatMap((page) => page.jobs),
    );
    const after = readRun();
    if (after.run_attempt !== selected.run_attempt)
      throw new Error('Workflow attempt changed while reading jobs; repeat the snapshot');
    try {
      run('git', ['merge-base', '--is-ancestor', releaseRun.candidate.sha!, localBase]);
      candidateOnBase = true;
    } catch (error) {
      if ((error as { status?: number }).status !== 1) throw error;
    }
  }
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
    prWorkflowRuns,
    mergeWorkflowRuns,
    releaseRun,
    candidateOnBase,
  };
  const ready = pr
    ? repositoryReady({ ...snapshot, pr })
    : snapshot.clean &&
      localStable &&
      branch === base &&
      localBase === remoteBefore &&
      remoteBefore === remoteAfter &&
      candidateOnBase;
  console.log(
    JSON.stringify(
      {
        ...snapshot,
        repositoryReady: ready,
        scope:
          'Repository snapshot only; exit 0 does not certify deployment. Review PR-head checks when applicable, fixed candidate admission, software publication when applicable, and each target deployment/smoke separately. The selected run includes current-attempt jobs and steps; absent jobs are not success. Its run-name records requested source, not admission success. Commit queries are limited to 100 runs and cannot discover dispatch inputs; use --run for content deployment. Main pushes do not rerun verify.',
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
