import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import {
  ArtifactClient,
  downloadRelease,
  latestPrRun,
  prepareReleaseArtifacts,
  verifyEvidence,
  type ReleaseRecord,
  type ValidationRun,
} from '../../scripts/release-artifacts';
import { sha256, type ReleaseEvidence } from '../../scripts/release-evidence';

const repository = 'sionrbot/blog';
const headSha = 'a'.repeat(40);
const mergeSha = 'b'.repeat(40);
const tree = 'c'.repeat(40);
const testedSha = 'd'.repeat(40);
const tag = 'v1.7.2';
const candidate = { sha: mergeSha, pullRequest: { number: 42 }, tag: { toString: () => tag } };
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function temporary() {
  const path = await mkdtemp(join(tmpdir(), 'release-artifact-test-'));
  directories.push(path);
  return path;
}
function run(overrides: Partial<ValidationRun> = {}): ValidationRun {
  return {
    id: 10,
    run_number: 1,
    run_attempt: 1,
    head_sha: headSha,
    event: 'pull_request',
    path: '.github/workflows/ci.yml',
    status: 'completed',
    conclusion: 'success',
    head_repository: { full_name: repository },
    ...overrides,
  };
}
const pages = Buffer.from('Pages production output');
const workers = Buffer.from('Workers production output');
function evidence(overrides: Partial<ReleaseEvidence> = {}): ReleaseEvidence {
  return {
    schema: 1,
    kind: 'bundle',
    repository,
    pullRequest: 42,
    headSha,
    testedSha,
    tree,
    runId: 10,
    runAttempt: 1,
    version: '1.7.2',
    files: { 'pages.tar': sha256(pages), 'workers.tar': sha256(workers) },
    ...overrides,
  };
}
const expected = {
  kind: 'bundle' as const,
  repository,
  pullRequest: 42,
  headSha,
  tree,
  tag,
  run: run(),
};

async function zip(files: Record<string, Buffer | string>) {
  const directory = await temporary();
  for (const [name, bytes] of Object.entries(files)) await writeFile(join(directory, name), bytes);
  execFileSync('zip', ['-q', 'archive.zip', ...Object.keys(files)], { cwd: directory });
  return readFile(join(directory, 'archive.zip'));
}

async function fixture({
  bundle = evidence(),
  e2e = evidence({ kind: 'e2e', runId: 20, files: {} }),
  extraEntry = false,
} = {}) {
  const bundleZip = await zip({
    'manifest.json': JSON.stringify(bundle),
    'pages.tar': pages,
    'workers.tar': workers,
    ...(extraEntry ? { 'unexpected.txt': 'not allowed' } : {}),
  });
  const e2eZip = await zip({ 'manifest.json': JSON.stringify(e2e) });
  const state = {
    pr: {
      merged: true,
      merge_commit_sha: mergeSha,
      base: { ref: 'main', repo: { full_name: repository } },
      head: {
        sha: headSha,
        ref: 'release-please--branches--main--components--sionrbot-blog',
        repo: { full_name: repository },
      },
    },
    ci: [run()],
    e2e: [run({ id: 20, path: '.github/workflows/e2e.yml' })],
    commit: { tree: { sha: tree } },
    tested: { tree: { sha: tree }, parents: [{ sha: mergeSha }, { sha: headSha }] },
    bundleArtifacts: [
      { id: 100, name: 'release-bundle-1', expired: false, digest: `sha256:${sha256(bundleZip)}` },
    ],
    e2eArtifacts: [
      { id: 200, name: 'e2e-evidence-1', expired: false, digest: `sha256:${sha256(e2eZip)}` },
    ],
    release: { id: 99, tag_name: tag, draft: true, prerelease: false, target_commitish: mergeSha },
    publications: 0,
    failPublication: false,
    assets: [] as { id: number; name: string; state: string; digest: string }[],
    bytes: new Map<number, Buffer>(),
    uploads: [] as string[],
    requests: [] as string[],
    tagged: { sha: mergeSha, commit: { tree: { sha: tree } } },
  };
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const path = url.pathname.replace(`/repos/${repository}/`, '');
    state.requests.push(path);
    if (url.hostname === 'uploads.github.com') {
      if (!state.release.draft) return new Response('Immutable release', { status: 422 });
      const name = url.searchParams.get('name')!;
      const bytes = Buffer.from(init?.body as Uint8Array);
      const asset = {
        id: 1000 + state.assets.length,
        name,
        state: 'uploaded',
        digest: `sha256:${sha256(bytes)}`,
      };
      state.assets.push(asset);
      state.bytes.set(asset.id, bytes);
      state.uploads.push(name);
      return Response.json(asset);
    }
    if (path === 'releases/99' && init?.method === 'PATCH') {
      if (state.failPublication) return new Response('Temporary failure', { status: 503 });
      expect(state.uploads).toContain('release-manifest.json');
      expect(JSON.parse(init.body as string)).toEqual({ draft: false, make_latest: 'true' });
      state.release.draft = false;
      state.publications++;
      return Response.json(state.release);
    }
    const json: Record<string, unknown> = {
      releases: [state.release],
      'pulls/42': state.pr,
      'actions/workflows/ci.yml/runs': { workflow_runs: state.ci },
      'actions/workflows/e2e.yml/runs': { workflow_runs: state.e2e },
      [`git/commits/${mergeSha}`]: state.commit,
      [`git/commits/${testedSha}`]: state.tested,
      'actions/runs/10/artifacts': { artifacts: state.bundleArtifacts },
      'actions/runs/20/artifacts': { artifacts: state.e2eArtifacts },
      [`releases/tags/${tag}`]: state.release,
      'releases/99/assets': state.assets,
      [`commits/${tag}`]: state.tagged,
    };
    if (path in json) return Response.json(json[path]);
    const accept = new Headers(init?.headers).get('Accept');
    if (path.startsWith('actions/artifacts/') && accept !== 'application/vnd.github+json') {
      return new Response('Unsupported Accept header for Actions artifacts', { status: 415 });
    }
    if (path.startsWith('releases/assets/') && accept !== 'application/octet-stream') {
      return new Response('Release asset metadata instead of binary', { status: 415 });
    }
    const binary =
      path === 'actions/artifacts/100/zip'
        ? bundleZip
        : path === 'actions/artifacts/200/zip'
          ? e2eZip
          : state.bytes.get(Number(path.split('/').at(-1)));
    if (binary) return new Response(new Uint8Array(binary));
    throw new Error(`Unexpected request: ${url}`);
  };
  const record: ReleaseRecord = { schema: 1, repository, tag, sha: mergeSha, bundle, e2e };
  function addAsset(name: string, bytes: Buffer) {
    const id = 1000 + state.assets.length;
    state.assets.push({ id, name, state: 'uploaded', digest: `sha256:${sha256(bytes)}` });
    state.bytes.set(id, bytes);
  }
  function published() {
    state.release.draft = false;
    addAsset('pages.tar', pages);
    addAsset('workers.tar', workers);
    addAsset('release-manifest.json', Buffer.from(JSON.stringify(record)));
  }
  return { state, fetcher, record, addAsset, published };
}

describe('latest PR validation', () => {
  it.each([
    { event: 'push' },
    { head_sha: mergeSha },
    { path: '.github/workflows/other.yml' },
    { head_repository: { full_name: 'fork/blog' } },
  ])('ignores a run outside the trusted PR workflow: %j', (change) => {
    expect(latestPrRun([run(change)], repository, 'ci.yml', headSha)).toBeUndefined();
  });
  it('chooses latest run and attempt even when unsuccessful', () => {
    const latest = run({ run_number: 2, run_attempt: 2, conclusion: 'failure' });
    expect(
      latestPrRun([run({ run_number: 2 }), latest, run()], repository, 'ci.yml', headSha),
    ).toBe(latest);
  });
});

describe('release evidence contract', () => {
  it('accepts matching bundle and empty E2E evidence', () => {
    expect(() => verifyEvidence(evidence(), expected)).not.toThrow();
    expect(() =>
      verifyEvidence(evidence({ kind: 'e2e', files: {} }), { ...expected, kind: 'e2e' }),
    ).not.toThrow();
  });
  it.each<Partial<ReleaseEvidence>>([
    { tree: headSha },
    { version: '9.0.0' },
    { runAttempt: 2 },
    { runId: 11 },
    { kind: 'e2e' as const },
    { repository: 'fork/blog' },
    { headSha: mergeSha },
    { pullRequest: 43 },
    { testedSha: 'invalid' },
    { files: {} },
    { files: { 'pages.tar': 'bad', 'workers.tar': sha256(workers) } },
    { files: { ...evidence().files, 'extra.tar': sha256(pages) } },
  ])('rejects evidence mismatch: %j', (change) => {
    expect(() => verifyEvidence(evidence(change), expected)).toThrow();
  });
});

describe('prepare release artifacts', () => {
  it.each(['unmerged', 'sha', 'base', 'base-repository', 'head-repository', 'branch'])(
    'rejects an invalid release PR: %s',
    async (change) => {
      const f = await fixture();
      if (change === 'unmerged') f.state.pr.merged = false;
      if (change === 'sha') f.state.pr.merge_commit_sha = headSha;
      if (change === 'base') f.state.pr.base.ref = 'topic';
      if (change === 'base-repository') f.state.pr.base.repo.full_name = 'fork/blog';
      if (change === 'head-repository') f.state.pr.head.repo.full_name = 'fork/blog';
      if (change === 'branch') f.state.pr.head.ref = 'topic';
      await expect(
        prepareReleaseArtifacts(repository, 'token', candidate, f.fetcher),
      ).rejects.toThrow('Release PR');
      expect(f.state.requests).toEqual(['pulls/42']);
    },
  );
  it.each(['ci', 'e2e'] as const)(
    'returns null when latest %s failed instead of falling back',
    async (key) => {
      const f = await fixture();
      f.state[key].push({ ...f.state[key][0], run_number: 2, conclusion: 'failure' });
      expect(await prepareReleaseArtifacts(repository, 'token', candidate, f.fetcher)).toBeNull();
      expect(f.state.requests.some((path) => path.includes('/artifacts'))).toBe(false);
    },
  );
  it.each(['expired', 'attempt', 'archive-digest', 'tree', 'parent', 'duplicate'])(
    'rejects invalid artifacts or tested commit: %s',
    async (change) => {
      const f = await fixture();
      if (change === 'expired') f.state.bundleArtifacts[0].expired = true;
      if (change === 'attempt') f.state.bundleArtifacts[0].name = 'release-bundle-2';
      if (change === 'archive-digest') f.state.bundleArtifacts[0].digest = 'sha256:bad';
      if (change === 'tree') f.state.tested.tree.sha = headSha;
      if (change === 'parent') f.state.tested.parents[1].sha = mergeSha;
      if (change === 'duplicate')
        f.state.bundleArtifacts.push({ ...f.state.bundleArtifacts[0], id: 101 });
      await expect(
        prepareReleaseArtifacts(repository, 'token', candidate, f.fetcher),
      ).rejects.toThrow();
    },
  );
  it('rejects nonallowlisted zip entries before reading the manifest', async () => {
    const f = await fixture({ extraEntry: true });
    await expect(
      prepareReleaseArtifacts(repository, 'token', candidate, f.fetcher),
    ).rejects.toThrow('Unexpected archive entries');
  });
  it('rejects a file with a valid archive digest but wrong manifest digest', async () => {
    const f = await fixture({
      bundle: evidence({ files: { ...evidence().files, 'pages.tar': sha256(workers) } }),
    });
    await expect(
      prepareReleaseArtifacts(repository, 'token', candidate, f.fetcher),
    ).rejects.toThrow('Bundle digest mismatch');
  });
  it('publishes verified files before readiness manifest and accepts an identical retry', async () => {
    const f = await fixture();
    const prepared = await prepareReleaseArtifacts(repository, 'token', candidate, f.fetcher);
    expect(prepared).not.toBeNull();
    try {
      await prepared!.publish();
      expect(f.state.uploads).toEqual(['pages.tar', 'workers.tar', 'release-manifest.json']);
      await prepared!.publish();
      expect(f.state.uploads).toHaveLength(3);
      expect(f.state.publications).toBe(1);
      const output = await temporary();
      expect(await downloadRelease(repository, 'token', tag, output, f.fetcher)).toEqual(f.record);
      expect(await readFile(join(output, 'pages.tar'))).toEqual(pages);
      expect(await readFile(join(output, 'workers.tar'))).toEqual(workers);
    } finally {
      await prepared?.dispose();
    }
  });
  it('refuses to replace conflicting existing assets and never marks the release ready', async () => {
    const f = await fixture();
    f.addAsset('workers.tar', Buffer.from('other build'));
    const prepared = await prepareReleaseArtifacts(repository, 'token', candidate, f.fetcher);
    try {
      await expect(prepared!.publish()).rejects.toThrow('conflicting release asset');
      expect(f.state.uploads).toEqual(['pages.tar']);
    } finally {
      await prepared?.dispose();
    }
  });
  it('resumes a fully uploaded draft after publication fails without uploading again', async () => {
    const f = await fixture();
    f.state.failPublication = true;
    const prepared = await prepareReleaseArtifacts(repository, 'token', candidate, f.fetcher);
    try {
      expect(prepared!.releaseExists).toBe(true);
      await expect(prepared!.publish()).rejects.toThrow('503');
      expect(f.state.release.draft).toBe(true);
      expect(f.state.uploads).toHaveLength(3);
      f.state.failPublication = false;
      await prepared!.publish();
      expect(f.state.uploads).toHaveLength(3);
      expect(f.state.publications).toBe(1);
    } finally {
      await prepared?.dispose();
    }
  });
  it.each(['wrong-target', 'published-incomplete'])(
    'refuses unsafe publication before any upload: %s',
    async (change) => {
      const f = await fixture();
      if (change === 'wrong-target') f.state.release.target_commitish = headSha;
      else f.state.release.draft = false;
      const prepared = await prepareReleaseArtifacts(repository, 'token', candidate, f.fetcher);
      try {
        await expect(prepared!.publish()).rejects.toThrow();
        expect(f.state.uploads).toEqual([]);
        expect(f.state.publications).toBe(0);
      } finally {
        await prepared?.dispose();
      }
    },
  );
});

describe('release download', () => {
  it.each(['tag-sha', 'tag-tree', 'e2e-tree', 'digest', 'missing', 'duplicate', 'draft'])(
    'blocks invalid or incomplete release: %s',
    async (change) => {
      const f = await fixture();
      if (change === 'e2e-tree') f.record.e2e.tree = headSha;
      f.published();
      if (change === 'tag-sha') f.state.tagged.sha = headSha;
      if (change === 'tag-tree') f.state.tagged.commit.tree.sha = headSha;
      if (change === 'digest') f.state.assets[0].digest = 'sha256:bad';
      if (change === 'missing') f.state.assets.splice(1, 1);
      if (change === 'duplicate') f.state.assets.push({ ...f.state.assets[0] });
      if (change === 'draft') f.state.release.draft = true;
      const output = await temporary();
      await expect(downloadRelease(repository, 'token', tag, output, f.fetcher)).rejects.toThrow();
      await expect(readFile(join(output, 'release-manifest.json'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    },
  );
  it('rejects unstable tags before contacting GitHub', async () => {
    const client: typeof fetch = async () => {
      throw new Error('Unexpected network call');
    };
    await expect(
      downloadRelease(repository, 'token', 'v1.0.0-rc.1', await temporary(), client),
    ).rejects.toThrow('stable vX.Y.Z');
  });
  it('rejects duplicate existing assets instead of silently selecting one', async () => {
    const f = await fixture();
    f.addAsset('pages.tar', pages);
    f.addAsset('pages.tar', pages);
    await expect(
      new ArtifactClient(repository, 'token', f.fetcher).upload(99, 'pages.tar', pages),
    ).rejects.toThrow('Duplicate release asset');
  });
});
