import { appendFile, readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const releaseBranch = 'release-please--branches--main--components--sionrbot-blog';
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export interface MergedPullRequest {
  number: number;
  merged: boolean;
  merge_commit_sha: string;
  base: { ref: string; repo: { full_name: string } };
  head: { ref: string; repo: { full_name: string } };
  labels: { name: string }[];
}
export interface FixedCandidate {
  repository: string;
  pr: number;
  sha: string;
  version: string;
  tag: string;
}
interface PublishedRelease {
  id: number;
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
}
export interface FixedReleaseApi {
  pullRequest(number: number): Promise<MergedPullRequest>;
  file(path: string, sha: string): Promise<string>;
  tagCommit(tag: string): Promise<string | null>;
  release(tag: string): Promise<PublishedRelease | null>;
  latest(): Promise<PublishedRelease | null>;
  create(candidate: FixedCandidate, notes: string): Promise<void>;
  markPublished(pr: number): Promise<void>;
}

function validatePullRequest(pr: MergedPullRequest, repository: string): void {
  if (
    !Number.isSafeInteger(pr.number) ||
    pr.number <= 0 ||
    !pr.merged ||
    !/^[a-f0-9]{40}$/.test(pr.merge_commit_sha) ||
    pr.base.ref !== 'main' ||
    pr.base.repo.full_name !== repository ||
    pr.head.repo.full_name !== repository ||
    pr.head.ref !== releaseBranch
  )
    throw new Error('Expected a merged same-repository Release PR into main');
}

// Event identity survives a workflow rerun; moving main is never a source input.
export async function fixedCandidate(
  api: FixedReleaseApi,
  repository: string,
  event: { action: string; pull_request: MergedPullRequest },
): Promise<FixedCandidate> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || event.action !== 'closed') {
    throw new Error('Expected the original closed Release PR event');
  }
  validatePullRequest(event.pull_request, repository);
  const pr = await api.pullRequest(event.pull_request.number);
  validatePullRequest(pr, repository);
  if (pr.merge_commit_sha !== event.pull_request.merge_commit_sha) {
    throw new Error('Release PR merge SHA differs from the original event');
  }
  const sha = pr.merge_commit_sha;
  const [pkg, manifest] = await Promise.all([
    api.file('package.json', sha),
    api.file('.release-please-manifest.json', sha),
  ]);
  const version: unknown = (JSON.parse(pkg) as { version?: unknown }).version;
  if (
    typeof version !== 'string' ||
    !stableVersion.test(version) ||
    (JSON.parse(manifest) as Record<string, unknown>)['.'] !== version
  ) {
    throw new Error('Fixed source version files must agree on a stable version');
  }
  const candidate = { repository, pr: pr.number, sha, version, tag: `v${version}` };
  await consistentTag(api, candidate);
  const release = await api.release(candidate.tag);
  if (release && (release.draft || release.prerelease)) {
    throw new Error('Existing draft or prerelease requires explicit reconciliation');
  }
  if (!release && !pr.labels.some(({ name }) => name === 'autorelease: pending')) {
    throw new Error('Unpublished candidate is retired or has no pending label');
  }
  return candidate;
}

async function consistentTag(api: FixedReleaseApi, candidate: FixedCandidate): Promise<boolean> {
  const sha = await api.tagCommit(candidate.tag);
  if (sha !== null && sha !== candidate.sha) throw new Error(`Conflicting tag ${candidate.tag}`);
  return sha !== null;
}

export function releaseNotes(changelog: string, version: string): string {
  const sections = changelog.split(/^## /m).slice(1);
  const section = sections.find(
    (value) =>
      value.startsWith(`[${version}]`) ||
      value.startsWith(`${version} `) ||
      value.startsWith(`${version}\n`),
  );
  if (!section) throw new Error(`Missing changelog entry for ${version}`);
  return section.slice(section.indexOf('\n') + 1).trim();
}

// This operation is wired only after verification and both target builds in the
// prepared workflow. It neither downloads old artifacts nor edits existing releases.
export async function publishFixed(api: FixedReleaseApi, candidate: FixedCandidate): Promise<void> {
  const tagged = await consistentTag(api, candidate);
  const existing = await api.release(candidate.tag);
  if (existing) {
    if (existing.draft || existing.prerelease || !tagged) {
      throw new Error('Existing release is not a consistent published stable release');
    }
  } else {
    const pr = await api.pullRequest(candidate.pr);
    validatePullRequest(pr, candidate.repository);
    if (
      pr.merge_commit_sha !== candidate.sha ||
      !pr.labels.some(({ name }) => name === 'autorelease: pending')
    ) {
      throw new Error('Candidate changed or was explicitly retired');
    }
    const notes = releaseNotes(await api.file('CHANGELOG.md', candidate.sha), candidate.version);
    await api.create(candidate, notes);
    if (!(await consistentTag(api, candidate))) throw new Error('Published release tag is missing');
    const created = await api.release(candidate.tag);
    if (!created || created.draft || created.prerelease)
      throw new Error('Release is not published');
  }
  // A label update failure can be retried without modifying published history.
  await api.markPublished(candidate.pr);
}

export async function mayDeploy(api: FixedReleaseApi, candidate: FixedCandidate): Promise<boolean> {
  if (!(await consistentTag(api, candidate))) throw new Error('Deployment tag is missing');
  const release = await api.release(candidate.tag);
  if (!release || release.draft || release.prerelease)
    throw new Error('Deployment needs a stable Release');
  const latest = await api.latest();
  return (
    latest !== null && !latest.draft && !latest.prerelease && latest.tag_name === candidate.tag
  );
}

export function fixedReleaseApi(
  repository: string,
  token: string,
  fetcher = fetch,
): FixedReleaseApi {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Invalid repository');
  async function request<T>(
    path: string,
    method = 'GET',
    body?: unknown,
    missing = false,
  ): Promise<T | null> {
    const response = await fetcher(`https://api.github.com/repos/${repository}/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        // Candidate identity needs merge_commit_sha, removed from REST PRs in 2026-03-10.
        'X-GitHub-Api-Version': '2022-11-28',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30_000),
    });
    if (missing && response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub ${method} ${path}: ${response.status}`);
    return response.status === 204 ? null : ((await response.json()) as T);
  }
  async function required<T>(path: string): Promise<T> {
    const value = await request<T>(path);
    if (value === null) throw new Error(`Missing GitHub response: ${path}`);
    return value;
  }
  return {
    pullRequest: (number) => required(`pulls/${number}`),
    async file(path, sha) {
      const file = await required<{ encoding: string; content: string }>(
        `contents/${encodeURIComponent(path)}?ref=${sha}`,
      );
      if (file.encoding !== 'base64') throw new Error(`Unexpected encoding: ${path}`);
      return Buffer.from(file.content, 'base64').toString('utf8');
    },
    async tagCommit(tag) {
      type GitObject = { type: string; sha: string };
      const ref = await request<{ object: GitObject }>(
        `git/ref/tags/${encodeURIComponent(tag)}`,
        'GET',
        undefined,
        true,
      );
      let object = ref?.object;
      const seen = new Set<string>();
      while (object?.type === 'tag') {
        if (seen.has(object.sha)) throw new Error('Cyclic tag');
        seen.add(object.sha);
        object = (await required<{ object: GitObject }>(`git/tags/${object.sha}`)).object;
      }
      if (object && object.type !== 'commit') throw new Error('Tag does not resolve to commit');
      return object?.sha ?? null;
    },
    release: (tag) => request(`releases/tags/${encodeURIComponent(tag)}`, 'GET', undefined, true),
    latest: () => request('releases/latest', 'GET', undefined, true),
    async create(candidate, notes) {
      await request('releases', 'POST', {
        tag_name: candidate.tag,
        target_commitish: candidate.sha,
        name: candidate.tag,
        body: notes,
        draft: false,
        prerelease: false,
        // GitHub determines latest by version rather than late execution order.
        make_latest: 'legacy',
      });
    },
    async markPublished(pr) {
      await request(`issues/${pr}/labels`, 'POST', { labels: ['autorelease: tagged'] });
      await request(
        `issues/${pr}/labels/${encodeURIComponent('autorelease: pending')}`,
        'DELETE',
        undefined,
        true,
      );
    },
  };
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (!['candidate', 'publish', 'latest'].includes(mode ?? '')) {
    throw new Error('Usage: node scripts/release-fixed.ts <candidate|publish|latest>');
  }
  const {
    GITHUB_REPOSITORY: repository,
    GITHUB_TOKEN: token,
    GITHUB_EVENT_PATH: eventPath,
  } = process.env;
  if (!repository || !token || !eventPath)
    throw new Error('Repository, token and original event required');
  const api = fixedReleaseApi(repository, token);
  const event = JSON.parse(await readFile(eventPath, 'utf8')) as Parameters<
    typeof fixedCandidate
  >[2];
  const candidate = await fixedCandidate(api, repository, event);
  const head = execFileSync(
    'git',
    ['-c', `safe.directory=${realpathSync(process.cwd())}`, 'rev-parse', 'HEAD'],
    { encoding: 'utf8' },
  ).trim();
  const pkg = JSON.parse(await readFile('package.json', 'utf8')) as { version: string };
  const manifest = JSON.parse(await readFile('.release-please-manifest.json', 'utf8')) as Record<
    string,
    string
  >;
  if (
    head !== candidate.sha ||
    pkg.version !== candidate.version ||
    manifest['.'] !== candidate.version
  ) {
    throw new Error('Checkout must match the original fixed candidate');
  }
  let output = `sha=${candidate.sha}\nversion=${candidate.version}\ntag=${candidate.tag}\npr=${candidate.pr}\n`;
  if (mode === 'publish') await publishFixed(api, candidate);
  if (mode === 'latest') {
    const deploy = await mayDeploy(api, candidate);
    output += `deploy=${deploy}\n`;
    if (!deploy)
      console.log(`${candidate.tag} superseded; skipping deployment, preserving history.`);
  }
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, output);
  console.log(output.trim());
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
