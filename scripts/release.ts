import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Errors, GitHub, Manifest, type ReleasePullRequest } from 'release-please';

export const requiredWorkflows = ['ci.yml', 'e2e.yml'] as const;

export interface WorkflowRun {
  id: number;
  run_number: number;
  run_attempt: number;
  head_sha: string;
  head_branch: string;
  event: string;
  status: string;
  conclusion: string | null;
}

interface GitObject {
  type: string;
  sha: string;
}

export interface ReleaseCandidate {
  sha: string;
  path: string;
  pullRequest: { number: number; sha?: string };
  tag: { toString(): string; version: { toString(): string } };
}

export interface ReleaseApi {
  runs(workflow: string, sha: string): Promise<WorkflowRun[]>;
  tag(name: string): Promise<GitObject | null>;
  taggedObject(sha: string): Promise<GitObject>;
  jsonFile(path: string, sha: string): Promise<Record<string, unknown>>;
}

export function latestPushRun(runs: WorkflowRun[], sha: string): WorkflowRun | undefined {
  return runs
    .filter((run) => run.head_sha === sha && run.head_branch === 'main' && run.event === 'push')
    .sort((a, b) => b.run_number - a.run_number || b.run_attempt - a.run_attempt || b.id - a.id)[0];
}

export async function tagCommit(api: ReleaseApi, name: string): Promise<string | null> {
  let object = await api.tag(name);
  const seen = new Set<string>();
  while (object?.type === 'tag') {
    if (seen.has(object.sha)) throw new Error(`Cyclic tag object for ${name}`);
    seen.add(object.sha);
    object = await api.taggedObject(object.sha);
  }
  if (object && object.type !== 'commit') throw new Error(`Tag ${name} does not point to a commit`);
  return object?.sha ?? null;
}

export async function verifyTag(api: ReleaseApi, name: string, sha: string): Promise<boolean> {
  const existing = await tagCommit(api, name);
  if (existing && existing !== sha) throw new Error(`Tag ${name} points to a different commit`);
  return existing !== null;
}

export async function candidateReady(
  api: ReleaseApi,
  candidate: ReleaseCandidate,
): Promise<boolean> {
  const { sha, tag, pullRequest } = candidate;
  if (!/^[a-f0-9]{40}$/.test(sha) || sha !== pullRequest.sha || candidate.path !== '.') {
    throw new Error(`Invalid release commit or package for PR #${pullRequest.number}`);
  }
  const version = tag.version.toString();
  if (tag.toString() !== `v${version}`) throw new Error('Unexpected release tag format');
  const [pkg, manifest] = await Promise.all([
    api.jsonFile('package.json', sha),
    api.jsonFile('.release-please-manifest.json', sha),
  ]);
  if (pkg.version !== version || manifest['.'] !== version) {
    throw new Error(`Version files at ${sha} do not match ${tag.toString()}`);
  }
  await verifyTag(api, tag.toString(), sha);
  const runs = await Promise.all(requiredWorkflows.map((workflow) => api.runs(workflow, sha)));
  return runs.every((workflowRuns) => {
    const run = latestPushRun(workflowRuns, sha);
    return run?.status === 'completed' && run.conclusion === 'success';
  });
}

export function setInitialRelease(manifest: {
  releasedVersions: Record<string, { toString(): string }>;
  repositoryConfig: Record<string, { releaseAs?: string }>;
}): void {
  if (manifest.releasedVersions['.']?.toString() === '1.4.1') {
    manifest.repositoryConfig['.'].releaseAs = '1.5.0';
    // 1.4.1 is inherited theme metadata, not a release in this repository.
    // Do not generate a comparison link to a nonexistent origin tag.
    delete manifest.releasedVersions['.'];
  }
}

export function formatReleaseFile(path: string, content: string): string {
  // The Node strategy updates JSON metadata and Markdown changelogs. Preserve
  // any other file format rather than guessing a parser or changing lockfiles.
  if (!/\.(?:json|md)$/.test(path)) return content;
  const result = spawnSync('pnpm', ['exec', 'vp', 'fmt', '--stdin-filepath', path], {
    input: content,
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`Could not format release update: ${path}`);
  }
  return result.stdout;
}

export async function createFormattedPullRequests<
  T extends Pick<ReleasePullRequest, 'updates'>,
>(manifest: {
  buildPullRequests(): Promise<T[]>;
  createPullRequests(): Promise<unknown>;
}): Promise<unknown> {
  const candidates = await manifest.buildPullRequests();
  for (const candidate of candidates) {
    for (const update of candidate.updates) {
      const updater = update.updater;
      update.updater = {
        updateContent(content, logger) {
          return formatReleaseFile(update.path, updater.updateContent(content, logger));
        },
      };
    }
  }
  // Keep the formatted updaters when createPullRequests internally builds again.
  // Its pending-release and existing-PR checks still run normally.
  manifest.buildPullRequests = async () => candidates;
  return manifest.createPullRequests();
}

export async function publishReady<T extends ReleaseCandidate>(
  manifest: { buildReleases(): Promise<T[]>; createReleases(): Promise<unknown> },
  api: ReleaseApi,
): Promise<number> {
  const candidates = await manifest.buildReleases();
  // This repository has one root package. Fail closed rather than letting a duplicate
  // from one concurrent release hide another candidate's partial failure.
  if (candidates.length > 1)
    throw new Error('Multiple pending releases require manual reconciliation');
  const approved: T[] = [];
  for (const candidate of candidates) {
    if (await candidateReady(api, candidate)) approved.push(candidate);
    else console.log(`Waiting for CI and E2E at ${candidate.sha} (${candidate.tag.toString()}).`);
  }
  if (approved.length === 0) {
    console.log('No release candidates are ready.');
    return 0;
  }
  // release-please 17.11.2 calls buildReleases again inside createReleases.
  // Freeze this instance's candidates so a newly merged PR cannot bypass the SHA checks above.
  manifest.buildReleases = async () => approved;
  try {
    await manifest.createReleases();
  } catch (error) {
    // 17.11.2 migrates pending/tagged labels, then throws this exact error when
    // the sole release already exists. Promise.all preserves it without wrapping.
    // Verify the actual tag below before accepting the retry as successful.
    if (!(error instanceof Errors.DuplicateReleaseError)) throw error;
  }
  for (const candidate of approved) {
    if (!(await verifyTag(api, candidate.tag.toString(), candidate.sha))) {
      throw new Error(`Published release has no tag: ${candidate.tag.toString()}`);
    }
  }
  return approved.length;
}

export async function publishAndRefresh<T extends ReleaseCandidate>(
  manifest: { buildReleases(): Promise<T[]>; createReleases(): Promise<unknown> },
  api: ReleaseApi,
  reload: () => Promise<
    Parameters<typeof setInitialRelease>[0] & {
      buildPullRequests(): Promise<ReleasePullRequest[]>;
      createPullRequests(): Promise<unknown>;
    }
  >,
  refreshWhenIdle = false,
): Promise<number> {
  const published = await publishReady(manifest, api);
  if (published > 0 || refreshWhenIdle) {
    // A pending release blocks new release PRs. Re-read main after publication
    // to include changes merged while that release was waiting for its checks.
    // Automatic sync also refreshes when idle: a newer queued workflow may have
    // replaced the push run that would otherwise create the next release PR.
    const refreshed = await reload();
    setInitialRelease(refreshed);
    await createFormattedPullRequests(refreshed);
  }
  return published;
}

export function createReleaseApi(
  repository: string,
  token: string,
  fetcher: typeof fetch = fetch,
): ReleaseApi {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Invalid GITHUB_REPOSITORY');
  const base = `https://api.github.com/repos/${repository}`;
  async function request<T>(path: string, allowMissing = false): Promise<T | null> {
    const response = await fetcher(`${base}/${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (allowMissing && response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub API request failed: ${response.status} (${path})`);
    return (await response.json()) as T;
  }
  async function required<T>(path: string): Promise<T> {
    const result = await request<T>(path);
    if (result === null) throw new Error(`Empty GitHub response: ${path}`);
    return result;
  }
  return {
    async runs(workflow, sha) {
      const runs: WorkflowRun[] = [];
      for (let page = 1; ; page++) {
        const query = new URLSearchParams({
          head_sha: sha,
          branch: 'main',
          event: 'push',
          per_page: '100',
          page: String(page),
        });
        const result = await required<{ workflow_runs: WorkflowRun[] }>(
          `actions/workflows/${encodeURIComponent(workflow)}/runs?${query}`,
        );
        runs.push(...result.workflow_runs);
        if (result.workflow_runs.length < 100) return runs;
      }
    },
    async tag(name) {
      const ref = await request<{ object: GitObject }>(
        `git/ref/tags/${encodeURIComponent(name)}`,
        true,
      );
      return ref?.object ?? null;
    },
    async taggedObject(sha) {
      return (await required<{ object: GitObject }>(`git/tags/${sha}`)).object;
    },
    async jsonFile(path, sha) {
      const file = await required<{ content: string; encoding: string }>(
        `contents/${encodeURIComponent(path)}?ref=${sha}`,
      );
      if (file.encoding !== 'base64') throw new Error(`Unexpected encoding for ${path}`);
      return JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')) as Record<
        string,
        unknown
      >;
    },
  };
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (!['pr', 'publish', 'sync', 'check'].includes(mode ?? '')) {
    throw new Error('Usage: node scripts/release.ts <pr|publish|sync|check>');
  }
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!token || !repository) throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY are required');
  const api = createReleaseApi(repository, token);
  const [owner, repo] = repository.split('/');
  async function loadManifest(): Promise<Manifest> {
    // GitHub caches branch files. A fresh client is needed as well as a fresh
    // Manifest when main advances while a release is being published.
    const github = await GitHub.create({ owner, repo, token });
    // Release publishing needs label transitions, but no automatic PR conversation messages.
    github.commentOnIssue = async () => '';
    return Manifest.fromManifest(github, 'main');
  }
  const manifest = await loadManifest();
  setInitialRelease(manifest);
  if (mode === 'pr') await createFormattedPullRequests(manifest);
  else if (mode === 'publish' || mode === 'sync') {
    await publishAndRefresh(manifest, api, loadManifest, mode === 'sync');
  } else {
    const pullRequests = await manifest.buildPullRequests();
    const releases = await manifest.buildReleases();
    console.log(
      JSON.stringify(
        {
          pullRequests: pullRequests.map((pullRequest) => ({
            title: pullRequest.title.toString(),
            version: pullRequest.version?.toString(),
            notes: pullRequest.body.toString(),
          })),
          releases: releases.map((release) => ({
            title: release.name,
            version: release.tag.version.toString(),
            tag: release.tag.toString(),
            sha: release.sha,
            notes: release.notes,
          })),
        },
        null,
        2,
      ),
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Release command failed');
    process.exitCode = 1;
  });
}
