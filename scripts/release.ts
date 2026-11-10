import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { prepareReleaseArtifacts, type PreparedReleaseArtifacts } from './release-artifacts.ts';
import { Errors, GitHub, Manifest, type ReleasePullRequest } from 'release-please';

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
  prepareArtifacts(candidate: ReleaseCandidate): Promise<PreparedReleaseArtifacts | null>;
  retryPublication(candidate: ReleaseCandidate): Promise<void>;
  published(candidate: ReleaseCandidate): Promise<void>;
  tag(name: string): Promise<GitObject | null>;
  taggedObject(sha: string): Promise<GitObject>;
  jsonFile(path: string, sha: string): Promise<Record<string, unknown>>;
}

export function deferReleaseLabels(
  github: Pick<GitHub, 'removeIssueLabels' | 'addIssueLabels'>,
): void {
  // Keep merged candidates discoverable across runner loss until all assets are ready.
  const remove = github.removeIssueLabels.bind(github);
  const add = github.addIssueLabels.bind(github);
  github.removeIssueLabels = async (labels, number) => {
    const remaining = labels.filter((label) => label !== 'autorelease: pending');
    if (remaining.length) await remove(remaining, number);
  };
  github.addIssueLabels = async (labels, number) => {
    const remaining = labels.filter((label) => label !== 'autorelease: tagged');
    if (remaining.length) await add(remaining, number);
  };
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
): Promise<PreparedReleaseArtifacts | null> {
  const { sha, tag, pullRequest } = candidate;
  if (!/^[a-f0-9]{40}$/.test(sha) || sha !== pullRequest.sha || candidate.path !== '.') {
    throw new Error(`Invalid release commit or package for PR #${pullRequest.number}`);
  }
  const version = tag.version.toString();
  if (
    tag.toString() !== `v${version}` ||
    !/^v[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(tag.toString())
  ) {
    throw new Error('Unexpected release tag format');
  }
  const [pkg, manifest] = await Promise.all([
    api.jsonFile('package.json', sha),
    api.jsonFile('.release-please-manifest.json', sha),
  ]);
  if (pkg.version !== version || manifest['.'] !== version) {
    throw new Error(`Version files at ${sha} do not match ${tag.toString()}`);
  }
  await verifyTag(api, tag.toString(), sha);
  return api.prepareArtifacts(candidate);
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
  const candidate = candidates[0];
  if (!candidate) {
    console.log('No release candidates are ready.');
    return 0;
  }
  const prepared = await candidateReady(api, candidate);
  if (!prepared) {
    console.log(`Waiting for validated PR artifacts for ${candidate.tag.toString()}.`);
    return 0;
  }
  // release-please rebuilds internally. Freeze the validated candidate and force
  // a draft so immutable releases are not locked before assets are attached.
  manifest.buildReleases = async () => [{ ...candidate, draft: true }];
  try {
    try {
      if (!prepared.releaseExists) await manifest.createReleases();
    } catch (error) {
      // A concurrent attempt may have created the draft. Promotion revalidates
      // the release identity and asset digests before publishing or accepting it.
      if (!(error instanceof Errors.DuplicateReleaseError)) throw error;
    }
    await prepared.publish();
    if (!(await verifyTag(api, candidate.tag.toString(), candidate.sha))) {
      throw new Error(`Published release has no tag: ${candidate.tag.toString()}`);
    }
    await api.published(candidate);
    return 1;
  } catch (error) {
    // Restore pending if final label transitions partially failed. Asset failures
    // retain pending throughout, including when a runner exits without cleanup.
    try {
      await api.retryPublication(candidate);
    } catch (recoveryError) {
      throw new AggregateError(
        [error, recoveryError],
        'Release failed and could not restore its pending label',
      );
    }
    throw error;
  } finally {
    await prepared.dispose();
  }
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
    prepareArtifacts(candidate) {
      return prepareReleaseArtifacts(repository, token, candidate, fetcher);
    },
    async retryPublication(candidate) {
      // Add pending first: an interrupted recovery must retain a discoverable
      // candidate. Release Please locates merged candidates by pending labels.
      const labels = `issues/${candidate.pullRequest.number}/labels`;
      const added = await fetcher(`${base}/${labels}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ labels: ['autorelease: pending'] }),
      });
      if (!added.ok)
        throw new Error(`Could not restore pending release PR #${candidate.pullRequest.number}`);
      const removed = await fetcher(
        `${base}/${labels}/${encodeURIComponent('autorelease: tagged')}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        },
      );
      if (!removed.ok && removed.status !== 404) {
        throw new Error(
          `Could not remove tagged label from release PR #${candidate.pullRequest.number}`,
        );
      }
    },
    async published(candidate) {
      const tag = candidate.tag.toString();
      if (!/^v[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(tag)) {
        throw new Error('Invalid release output tag');
      }
      const labels = `issues/${candidate.pullRequest.number}/labels`;
      const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      };
      const added = await fetcher(`${base}/${labels}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ labels: ['autorelease: tagged'] }),
      });
      if (!added.ok) throw new Error('Could not mark release PR tagged');
      const removed = await fetcher(
        `${base}/${labels}/${encodeURIComponent('autorelease: pending')}`,
        { method: 'DELETE', headers },
      );
      if (!removed.ok && removed.status !== 404)
        throw new Error('Could not clear pending release PR label');
      if (process.env.GITHUB_OUTPUT) {
        await appendFile(
          process.env.GITHUB_OUTPUT,
          `release_tag=${tag}\nrelease_sha=${candidate.sha}\n`,
        );
      }
      console.log(`Published ${tag} with validated deployment artifacts.`);
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
    deferReleaseLabels(github);
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
