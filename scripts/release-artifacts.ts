import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sha256, type ReleaseEvidence } from './release-evidence.ts';

interface Candidate {
  sha: string;
  pullRequest: { number: number };
  tag: { toString(): string };
}

export interface PreparedReleaseArtifacts {
  releaseExists: boolean;
  publish(createdReleaseId?: number): Promise<void>;
  dispose(): Promise<void>;
}

export interface ValidationRun {
  id: number;
  run_number: number;
  run_attempt: number;
  head_sha: string;
  event: string;
  path: string;
  status: string;
  conclusion: string | null;
  head_repository: { full_name: string };
}

interface Artifact {
  id: number;
  name: string;
  expired: boolean;
  digest: string;
}

interface Asset {
  id: number;
  name: string;
  state: string;
  digest: string;
}

interface PublishedRelease {
  id: number;
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  target_commitish: string;
}

export interface ReleaseRecord {
  schema: 1;
  repository: string;
  tag: string;
  sha: string;
  bundle: ReleaseEvidence;
  e2e: ReleaseEvidence;
}

export class ArtifactClient {
  readonly repository: string;
  private readonly token: string;
  private readonly fetcher: typeof fetch;

  constructor(repository: string, token: string, fetcher: typeof fetch = fetch) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Invalid repository');
    this.repository = repository;
    this.token = token;
    this.fetcher = fetcher;
  }

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${this.token}`);
    headers.set('X-GitHub-Api-Version', '2022-11-28');
    if (!headers.has('Accept')) headers.set('Accept', 'application/vnd.github+json');
    const response = await this.fetcher(`https://api.github.com/repos/${this.repository}/${path}`, {
      ...init,
      headers,
    });
    if (!response.ok) throw new Error(`GitHub ${response.status}: ${path}`);
    return response;
  }

  async json<T>(path: string): Promise<T> {
    return (await this.request(path)).json() as Promise<T>;
  }

  async list<T>(path: string, key?: string): Promise<T[]> {
    const all: T[] = [];
    for (let page = 1; ; page++) {
      const result = await this.json<T[] | Record<string, T[]>>(
        `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`,
      );
      const items = key ? (result as Record<string, T[]>)[key] : (result as T[]);
      if (!Array.isArray(items)) throw new Error(`Invalid GitHub list: ${path}`);
      all.push(...items);
      if (items.length < 100) return all;
    }
  }

  async binary(path: string, accept = 'application/octet-stream'): Promise<Buffer> {
    const response = await this.request(path, { headers: { Accept: accept } });
    return Buffer.from(await response.arrayBuffer());
  }

  async upload(releaseId: number, name: string, bytes: Buffer): Promise<void> {
    const assets = await this.list<Asset>(`releases/${releaseId}/assets`);
    const existing = assets.filter((asset) => asset.name === name);
    if (existing.length > 1) throw new Error(`Duplicate release asset: ${name}`);
    if (existing.length === 1) {
      const asset = existing[0];
      if (asset.state !== 'uploaded' || asset.digest !== `sha256:${sha256(bytes)}`) {
        throw new Error(`Refusing to replace conflicting release asset: ${name}`);
      }
      return;
    }
    const response = await this.fetcher(
      `https://uploads.github.com/repos/${this.repository}/releases/${releaseId}/assets?name=${encodeURIComponent(name)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': name.endsWith('.json') ? 'application/json' : 'application/x-tar',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: new Uint8Array(bytes),
      },
    );
    if (!response.ok) throw new Error(`Release asset upload failed (${response.status}): ${name}`);
    const asset = (await response.json()) as Asset;
    if (asset.state !== 'uploaded' || asset.digest !== `sha256:${sha256(bytes)}`) {
      throw new Error(`Release asset digest mismatch: ${name}`);
    }
  }
}

export function latestPrRun(
  runs: ValidationRun[],
  repository: string,
  workflow: string,
  headSha: string,
): ValidationRun | undefined {
  return runs
    .filter(
      (run) =>
        run.event === 'pull_request' &&
        run.head_sha === headSha &&
        run.head_repository?.full_name === repository &&
        run.path === `.github/workflows/${workflow}`,
    )
    .sort((a, b) => b.run_number - a.run_number || b.run_attempt - a.run_attempt || b.id - a.id)[0];
}

export function verifyEvidence(
  evidence: ReleaseEvidence,
  expected: {
    kind: 'bundle' | 'e2e';
    repository: string;
    pullRequest: number;
    headSha: string;
    tree: string;
    tag: string;
    run: ValidationRun;
  },
): void {
  if (
    evidence.schema !== 1 ||
    evidence.kind !== expected.kind ||
    evidence.repository !== expected.repository ||
    evidence.pullRequest !== expected.pullRequest ||
    evidence.headSha !== expected.headSha ||
    evidence.tree !== expected.tree ||
    !/^[a-f0-9]{40}$/.test(evidence.testedSha) ||
    evidence.runId !== expected.run.id ||
    evidence.runAttempt !== expected.run.run_attempt ||
    `v${evidence.version}` !== expected.tag
  ) {
    throw new Error(
      `${expected.kind} evidence does not match the merged Release PR and latest run`,
    );
  }
  const names = Object.keys(evidence.files).sort();
  const required = expected.kind === 'bundle' ? ['pages.tar', 'workers.tar'] : [];
  if (
    JSON.stringify(names) !== JSON.stringify(required) ||
    Object.values(evidence.files).some((digest) => !/^[a-f0-9]{64}$/.test(digest))
  ) {
    throw new Error('Invalid evidence file digests');
  }
}

async function readArtifact(
  client: ArtifactClient,
  run: ValidationRun,
  prefix: string,
  directory: string,
  names: string[],
): Promise<Record<string, Buffer>> {
  const artifacts = await client.list<Artifact>(`actions/runs/${run.id}/artifacts`, 'artifacts');
  const matches = artifacts.filter((artifact) => artifact.name === `${prefix}-${run.run_attempt}`);
  if (matches.length !== 1 || matches[0].expired) {
    throw new Error(`Missing or expired ${prefix} for run ${run.id}, attempt ${run.run_attempt}`);
  }
  const artifact = matches[0];
  // Actions uses the JSON media type to redirect to the archive download.
  const bytes = await client.binary(
    `actions/artifacts/${artifact.id}/zip`,
    'application/vnd.github+json',
  );
  if (artifact.digest !== `sha256:${sha256(bytes)}`)
    throw new Error('Artifact archive digest mismatch');
  const path = join(directory, `${prefix}.zip`);
  await writeFile(path, bytes);
  const entries = execFileSync('unzip', ['-Z1', path], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .sort();
  if (JSON.stringify(entries) !== JSON.stringify([...names].sort())) {
    throw new Error(`Unexpected archive entries in ${prefix}`);
  }
  // Read only allowlisted entries; never extract PR-controlled paths into the workspace.
  return Object.fromEntries(
    names.map((name) => [
      name,
      execFileSync('unzip', ['-p', path, name], { maxBuffer: 256 * 1024 * 1024 }),
    ]),
  );
}

export async function prepareReleaseArtifacts(
  repository: string,
  token: string,
  candidate: Candidate,
  fetcher: typeof fetch = fetch,
): Promise<PreparedReleaseArtifacts | null> {
  const client = new ArtifactClient(repository, token, fetcher);
  const pr = await client.json<{
    merged: boolean;
    merge_commit_sha: string;
    base: { ref: string; repo: { full_name: string } };
    head: { sha: string; ref: string; repo: { full_name: string } };
  }>(`pulls/${candidate.pullRequest.number}`);
  if (
    !pr.merged ||
    pr.merge_commit_sha !== candidate.sha ||
    pr.base.ref !== 'main' ||
    pr.base.repo.full_name !== repository ||
    pr.head.repo?.full_name !== repository ||
    pr.head.ref !== 'release-please--branches--main--components--sionrbot-blog'
  ) {
    throw new Error('Candidate is not the merged same-repository Release PR');
  }
  const runs = await Promise.all(
    ['ci.yml', 'e2e.yml'].map(async (workflow) => {
      const found = await client.list<ValidationRun>(
        `actions/workflows/${workflow}/runs?event=pull_request&head_sha=${pr.head.sha}`,
        'workflow_runs',
      );
      return latestPrRun(found, repository, workflow, pr.head.sha);
    }),
  );
  if (runs.some((run) => run?.status !== 'completed' || run.conclusion !== 'success')) return null;
  const [ci, e2e] = runs as [ValidationRun, ValidationRun];
  const commit = await client.json<{ tree: { sha: string } }>(`git/commits/${candidate.sha}`);
  const directory = await mkdtemp(join(tmpdir(), 'release-artifacts-'));
  const dispose = () => rm(directory, { recursive: true, force: true });
  try {
    const bundleFiles = await readArtifact(client, ci, 'release-bundle', directory, [
      'manifest.json',
      'pages.tar',
      'workers.tar',
    ]);
    const e2eFiles = await readArtifact(client, e2e, 'e2e-evidence', directory, ['manifest.json']);
    const bundle: ReleaseEvidence = JSON.parse(bundleFiles['manifest.json'].toString());
    const e2eEvidence: ReleaseEvidence = JSON.parse(e2eFiles['manifest.json'].toString());
    for (const [evidence, run, kind] of [
      [bundle, ci, 'bundle'],
      [e2eEvidence, e2e, 'e2e'],
    ] as const) {
      verifyEvidence(evidence, {
        kind,
        repository,
        pullRequest: candidate.pullRequest.number,
        headSha: pr.head.sha,
        tree: commit.tree.sha,
        tag: candidate.tag.toString(),
        run,
      });
      const tested = await client.json<{ tree: { sha: string }; parents: { sha: string }[] }>(
        `git/commits/${evidence.testedSha}`,
      );
      if (tested.tree.sha !== commit.tree.sha || tested.parents[1]?.sha !== pr.head.sha) {
        throw new Error('Tested PR merge tree does not match the release commit');
      }
    }
    for (const name of ['pages.tar', 'workers.tar']) {
      if (sha256(bundleFiles[name]) !== bundle.files[name])
        throw new Error(`Bundle digest mismatch: ${name}`);
    }
    const record: ReleaseRecord = {
      schema: 1,
      repository,
      tag: candidate.tag.toString(),
      sha: candidate.sha,
      bundle,
      e2e: e2eEvidence,
    };
    const findRelease = async () => {
      // Authenticated listing includes drafts, which may not yet have a public tag.
      const matches = (await client.list<PublishedRelease>('releases')).filter(
        (release) => release.tag_name === record.tag,
      );
      if (matches.length > 1) throw new Error(`Duplicate releases for ${record.tag}`);
      return matches[0];
    };
    const existingRelease = await findRelease();
    return {
      releaseExists: existingRelease !== undefined,
      dispose,
      async publish(createdReleaseId?: number) {
        // The create response identifies the draft before GitHub's release list
        // catches up. Retries retain the identity discovered during preparation.
        const releaseId = createdReleaseId ?? existingRelease?.id ?? (await findRelease())?.id;
        if (typeof releaseId !== 'number' || !Number.isSafeInteger(releaseId) || releaseId <= 0)
          throw new Error('Expected a valid release ID');
        const release = await client.json<PublishedRelease>(`releases/${releaseId}`);
        if (release.id !== releaseId || release.tag_name !== record.tag || release.prerelease)
          throw new Error('Expected a stable Release with matching identity');
        const files: Record<string, Buffer> = {
          'pages.tar': bundleFiles['pages.tar'],
          'workers.tar': bundleFiles['workers.tar'],
          'release-manifest.json': Buffer.from(`${JSON.stringify(record, null, 2)}\n`),
        };
        if (!release.draft) {
          // Published immutable releases cannot be repaired. An identical retry is safe.
          const assets = await client.list<Asset>(`releases/${release.id}/assets`);
          for (const [name, bytes] of Object.entries(files)) {
            const matches = assets.filter((asset) => asset.name === name);
            if (
              matches.length !== 1 ||
              matches[0].state !== 'uploaded' ||
              matches[0].digest !== `sha256:${sha256(bytes)}`
            )
              throw new Error(`Published release has missing or conflicting asset: ${name}`);
          }
          return;
        }
        if (release.target_commitish !== record.sha)
          throw new Error('Draft release targets a different commit');
        // Upload and verify every asset before publishing locks the release.
        for (const [name, bytes] of Object.entries(files))
          await client.upload(release.id, name, bytes);
        const published = (await (
          await client.request(`releases/${release.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ draft: false, make_latest: 'true' }),
          })
        ).json()) as PublishedRelease;
        if (published.draft || published.prerelease || published.tag_name !== record.tag)
          throw new Error('Release publication did not complete');
      },
    };
  } catch (error) {
    await dispose();
    throw error;
  }
}

export async function downloadRelease(
  repository: string,
  token: string,
  tag: string,
  directory: string,
  fetcher: typeof fetch = fetch,
): Promise<ReleaseRecord> {
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error('Expected a stable vX.Y.Z release tag');
  const client = new ArtifactClient(repository, token, fetcher);
  const release = await client.json<PublishedRelease>(`releases/tags/${encodeURIComponent(tag)}`);
  if (release.draft || release.prerelease || release.tag_name !== tag)
    throw new Error('Release is not published and stable');
  const assets = await client.list<Asset>(`releases/${release.id}/assets`);
  const download = async (name: string) => {
    const matches = assets.filter((asset) => asset.name === name);
    if (matches.length !== 1 || matches[0].state !== 'uploaded')
      throw new Error(`Missing release asset: ${name}`);
    const bytes = await client.binary(`releases/assets/${matches[0].id}`);
    if (matches[0].digest !== `sha256:${sha256(bytes)}`)
      throw new Error(`Release asset digest mismatch: ${name}`);
    return bytes;
  };
  const record: ReleaseRecord = JSON.parse((await download('release-manifest.json')).toString());
  if (
    record.schema !== 1 ||
    record.repository !== repository ||
    record.tag !== tag ||
    !/^[a-f0-9]{40}$/.test(record.sha)
  ) {
    throw new Error('Invalid release manifest');
  }
  const commit = await client.json<{ sha: string; commit: { tree: { sha: string } } }>(
    `commits/${encodeURIComponent(tag)}`,
  );
  if (
    commit.sha !== record.sha ||
    commit.commit.tree.sha !== record.bundle.tree ||
    record.e2e.tree !== record.bundle.tree
  ) {
    throw new Error('Release tag and validated source do not match');
  }
  for (const name of ['pages.tar', 'workers.tar']) {
    const bytes = await download(name);
    if (sha256(bytes) !== record.bundle.files[name])
      throw new Error(`Release manifest digest mismatch: ${name}`);
    await writeFile(join(directory, name), bytes);
  }
  await writeFile(join(directory, 'release-manifest.json'), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}
