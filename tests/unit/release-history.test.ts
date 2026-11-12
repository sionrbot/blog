import { describe, expect, it, vi } from 'vite-plus/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitHub, Manifest } from 'release-please';
import { Version } from 'release-please/build/src/version.js';
import { setInitialRelease } from '../../scripts/release';
import { prepareReleaseManifest } from '../../scripts/release-recovery';

const sha = (n: number) => n.toString().repeat(40);
function historyFixture() {
  const releases = [{ id: 1, tagName: 'v1.8.2', sha: sha(2), url: '', draft: false }];
  const commits = [
    { sha: sha(5), message: 'fix: repair the failed candidate', files: ['scripts/release.ts'] },
    { sha: sha(4), message: 'chore(release): release 1.8.3', files: ['package.json'] },
    { sha: sha(3), message: 'fix: unpublished search improvement', files: ['src/search.ts'] },
    { sha: sha(2), message: 'chore(release): release 1.8.2', files: ['package.json'] },
    { sha: sha(1), message: 'feat: already published bilingual routes', files: ['src/routes.ts'] },
    { sha: sha(0), message: 'chore: bootstrap', files: [] },
  ];
  const boundary = {
    repository: { owner: 'fixture', repo: 'blog', defaultBranch: 'main' },
    async getFileJson(path: string) {
      return path === '.release-please-manifest.json'
        ? { '.': '1.8.3' }
        : {
            'bootstrap-sha': sha(0),
            'include-component-in-tag': false,
            packages: { '.': { 'release-type': 'node', 'package-name': 'blog' } },
          };
    },
    async *releaseIterator() {
      yield* releases;
    },
    async *tagIterator() {
      yield { name: 'v1.8.2', sha: sha(2) };
    },
    async *mergeCommitIterator() {
      yield* commits;
    },
    async *pullRequestIterator() {},
    createPullRequest: vi.fn(async (request: unknown) => request),
  };
  const api = {
    async release(tag: string) {
      return tag === 'v1.8.2' ? { id: 1, tag_name: tag, draft: false, prerelease: false } : null;
    },
    async latest() {
      return { id: 1, tag_name: 'v1.8.2', draft: false, prerelease: false };
    },
    async tagCommit(tag: string) {
      return tag === 'v1.8.2' ? sha(2) : null;
    },
  };
  return { github: boundary as unknown as GitHub, releases, commits, boundary, api };
}

describe('retired candidate history discovery', () => {
  it('uses the public release boundary and an explicit later version through real Manifest discovery', async () => {
    const fixture = historyFixture();
    const manifest = await Manifest.fromManifest(fixture.github, 'release');
    await prepareReleaseManifest(fixture.github, manifest, fixture.api, {
      from: 'v1.8.2',
      releaseAs: '1.8.4',
    });
    const [candidate] = await manifest.buildPullRequests();
    expect(candidate!.version?.toString()).toBe('1.8.4');
    const notes = candidate!.body.toString();
    expect(notes).toContain('repair the failed candidate');
    expect(notes).toContain('unpublished search improvement');
    expect(notes).not.toContain('already published bilingual routes');
    expect(notes).toContain('v1.8.2...v1.8.4');
    const packageUpdate = candidate!.updates.find((update) => update.path === 'package.json')!;
    expect(JSON.parse(packageUpdate.updater.updateContent('{"version":"1.8.3"}')).version).toBe(
      '1.8.4',
    );
    const manifestUpdate = candidate!.updates.find(
      (update) => update.path === '.release-please-manifest.json',
    )!;
    expect(JSON.parse(manifestUpdate.updater.updateContent('{".":"1.8.3"}'))['.']).toBe('1.8.4');
    expect(fixture.boundary.createPullRequest).not.toHaveBeenCalled();
  });
  it('leaves a merged pending candidate untouched and blocks ordinary refresh after retirement', async () => {
    const fixture = historyFixture();
    const manifest = await Manifest.fromManifest(fixture.github, 'release');
    const pending = { labels: ['autorelease: pending'] };
    vi.spyOn(fixture.github, 'pullRequestIterator').mockImplementation(
      async function* (branch, state) {
        expect(branch).toBe('release');
        expect(state).toBe('MERGED');
        yield pending as never;
      },
    );
    await expect(prepareReleaseManifest(fixture.github, manifest, fixture.api)).resolves.toBe(
      false,
    );
    expect(manifest.releasedVersions['.']!.toString()).toBe('1.8.3');
    pending.labels.splice(0);
    await expect(prepareReleaseManifest(fixture.github, manifest, fixture.api)).rejects.toThrow(
      '--recover-from',
    );
    expect(fixture.boundary.createPullRequest).not.toHaveBeenCalled();
  });

  it('keeps published-version maintenance on its existing boundary', async () => {
    const fixture = historyFixture();
    vi.spyOn(fixture.api, 'release').mockResolvedValue({
      id: 2,
      tag_name: 'v1.8.3',
      draft: false,
      prerelease: false,
    });
    const manifest = await Manifest.fromManifest(fixture.github, 'release');
    await expect(prepareReleaseManifest(fixture.github, manifest, fixture.api)).resolves.toBe(true);
    expect(manifest.releasedVersions['.']!.toString()).toBe('1.8.3');
    expect(manifest.repositoryConfig['.']!.releaseAs).toBeUndefined();
  });

  it.each(['1.8.2', '1.8.3', '1.8.4-beta.1'])(
    'rejects next version %s rather than reusing a retired version',
    async (releaseAs) => {
      const fixture = historyFixture();
      const manifest = await Manifest.fromManifest(fixture.github, 'release');
      await expect(
        prepareReleaseManifest(fixture.github, manifest, fixture.api, {
          from: 'v1.8.2',
          releaseAs,
        }),
      ).rejects.toThrow();
    },
  );

  it.each(['draft', 'tag-mismatch', 'missing-history', 'existing-next'])(
    'rejects an unsafe recovery boundary: %s',
    async (condition) => {
      const fixture = historyFixture();
      if (condition === 'draft') fixture.releases[0]!.draft = true;
      if (condition === 'tag-mismatch') fixture.releases[0]!.sha = sha(9);
      if (condition === 'missing-history') fixture.commits.splice(3);
      if (condition === 'existing-next')
        vi.spyOn(fixture.api, 'tagCommit').mockImplementation(async (tag) =>
          tag === 'v1.8.4' ? sha(8) : tag === 'v1.8.2' ? sha(2) : null,
        );
      const manifest = await Manifest.fromManifest(fixture.github, 'release');
      await expect(
        prepareReleaseManifest(fixture.github, manifest, fixture.api, {
          from: 'v1.8.2',
          releaseAs: '1.8.4',
        }),
      ).rejects.toThrow();
      expect(manifest.releasedVersions['.']!.toString()).toBe('1.8.3');
    },
  );
  it.each(['draft', 'tag'])(
    'requires separate reconciliation when the unpublished manifest version has a %s',
    async (condition) => {
      const fixture = historyFixture();
      if (condition === 'draft') {
        const readRelease = fixture.api.release.bind(fixture.api);
        vi.spyOn(fixture.api, 'release').mockImplementation(async (tag) =>
          tag === 'v1.8.3'
            ? { id: 2, tag_name: tag, draft: true, prerelease: false }
            : readRelease(tag),
        );
      } else {
        const readTag = fixture.api.tagCommit.bind(fixture.api);
        vi.spyOn(fixture.api, 'tagCommit').mockImplementation(async (tag) =>
          tag === 'v1.8.3' ? sha(4) : readTag(tag),
        );
      }
      const manifest = await Manifest.fromManifest(fixture.github, 'release');
      await expect(
        prepareReleaseManifest(fixture.github, manifest, fixture.api, {
          from: 'v1.8.2',
          releaseAs: '1.8.4',
        }),
      ).rejects.toThrow('without a Release or tag');
      expect(manifest.releasedVersions['.']!.toString()).toBe('1.8.3');
      expect(manifest.repositoryConfig['.']!.releaseAs).toBeUndefined();
    },
  );

  it('rejects a public recovery base that is not the latest stable release', async () => {
    const fixture = historyFixture();
    vi.spyOn(fixture.api, 'latest').mockResolvedValue({
      id: 2,
      tag_name: 'v1.8.1',
      draft: false,
      prerelease: false,
    });
    const manifest = await Manifest.fromManifest(fixture.github, 'release');
    await expect(
      prepareReleaseManifest(fixture.github, manifest, fixture.api, {
        from: 'v1.8.2',
        releaseAs: '1.8.4',
      }),
    ).rejects.toThrow('latest public stable Release');
    expect(manifest.releasedVersions['.']!.toString()).toBe('1.8.3');
  });

  it('does not configure explicit recovery while a merged candidate is still pending', async () => {
    const fixture = historyFixture();
    vi.spyOn(fixture.github, 'pullRequestIterator').mockImplementation(
      async function* (branch, state) {
        expect(branch).toBe('release');
        expect(state).toBe('MERGED');
        yield { labels: ['autorelease: pending'] } as never;
      },
    );
    const manifest = await Manifest.fromManifest(fixture.github, 'release');
    await expect(
      prepareReleaseManifest(fixture.github, manifest, fixture.api, {
        from: 'v1.8.2',
        releaseAs: '1.8.4',
      }),
    ).resolves.toBe(false);
    expect(manifest.releasedVersions['.']!.toString()).toBe('1.8.3');
    expect(manifest.repositoryConfig['.']!.releaseAs).toBeUndefined();
    expect(fixture.boundary.createPullRequest).not.toHaveBeenCalled();
  });

  it('preserves the initial inherited-theme bootstrap without requiring a public project release', async () => {
    const fixture = historyFixture();
    const releaseRead = vi.spyOn(fixture.api, 'release');
    const manifest = await Manifest.fromManifest(fixture.github, 'release');
    manifest.releasedVersions['.'] = Version.parse('1.4.1');
    await expect(prepareReleaseManifest(fixture.github, manifest, fixture.api)).resolves.toBe(true);
    setInitialRelease(manifest);
    expect(manifest.repositoryConfig['.']!.releaseAs).toBe('1.5.0');
    expect(manifest.releasedVersions['.']).toBeUndefined();
    expect(releaseRead).not.toHaveBeenCalled();
  });
  it.each(['draft', 'prerelease'])(
    'rejects a recovery base whose REST Release is marked %s',
    async (state) => {
      const fixture = historyFixture();
      const readRelease = fixture.api.release.bind(fixture.api);
      vi.spyOn(fixture.api, 'release').mockImplementation(async (tag) =>
        tag === 'v1.8.2'
          ? { id: 1, tag_name: tag, draft: state === 'draft', prerelease: state === 'prerelease' }
          : readRelease(tag),
      );
      const manifest = await Manifest.fromManifest(fixture.github, 'release');
      await expect(
        prepareReleaseManifest(fixture.github, manifest, fixture.api, {
          from: 'v1.8.2',
          releaseAs: '1.8.4',
        }),
      ).rejects.toThrow('latest public stable Release');
      expect(manifest.releasedVersions['.']!.toString()).toBe('1.8.3');
    },
  );
});

it('discovers two promoted batches and a hotfix without repeating back-merged release history', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'release-history-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  const commit = (message: string) => {
    git('commit', '--allow-empty', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  try {
    git('init', '-b', 'main');
    git('config', 'user.email', 'test@example.invalid');
    git('config', 'user.name', 'Release test');
    writeFileSync(join(cwd, 'package.json'), '{"version":"1.8.2"}');
    git('add', 'package.json');
    const base = commit('chore: release baseline');
    git('branch', 'release');
    commit('feat: first promoted feature');
    git('branch', 'promote/first', 'main');
    git('checkout', '-q', 'release');
    let version = '1.8.2';
    const releases = [{ id: 1, tagName: 'v1.8.2', sha: base, url: '', draft: false }];
    const fixture = historyFixture();
    vi.spyOn(fixture.github, 'getFileJson').mockImplementation(
      async (path) =>
        (path === '.release-please-manifest.json'
          ? { '.': version }
          : {
              'include-component-in-tag': false,
              packages: { '.': { 'release-type': 'node', 'package-name': 'blog' } },
            }) as never,
    );
    vi.spyOn(fixture.github, 'releaseIterator').mockImplementation(async function* () {
      yield* releases;
    });
    vi.spyOn(fixture.github, 'tagIterator').mockImplementation(async function* () {
      for (const release of releases) yield { name: release.tagName, sha: release.sha };
    });
    let previewBranch = 'release';
    vi.spyOn(fixture.github, 'mergeCommitIterator').mockImplementation(async function* (branch) {
      expect(branch).toBe(previewBranch);
      for (const entry of git('log', '--topo-order', '--format=%H%x09%s', branch).split('\n')) {
        const [sha, message] = entry.split('\t');
        yield { sha: sha!, message: message!, files: ['package.json'] };
      }
    });
    const preview = async (targetBranch = 'release') => {
      previewBranch = targetBranch;
      const manifest = await Manifest.fromManifest(fixture.github, targetBranch);
      return (await manifest.buildPullRequests())[0]!;
    };
    expect(await preview()).toBeUndefined();
    const promotedPreview = await preview('promote/first');
    expect(promotedPreview.version?.toString()).toBe('1.9.0');
    expect(promotedPreview.body.toString()).toContain('first promoted feature');
    expect(fixture.boundary.createPullRequest).not.toHaveBeenCalled();
    git('merge', '--no-ff', 'promote/first', '-m', 'chore: promote first batch');
    const first = await preview();
    expect(first.version?.toString()).toBe('1.9.0');
    expect(first.body.toString()).toContain('first promoted feature');
    version = '1.9.0';
    const firstRelease = commit('chore(release): release 1.9.0');
    releases.unshift({ id: 2, tagName: 'v1.9.0', sha: firstRelease, url: '', draft: false });
    git('checkout', '-q', 'main');
    git('merge', '--no-ff', 'release', '-m', 'chore: back-merge version records');
    commit('feat: second promoted feature');
    git('checkout', '-q', 'release');
    git('merge', '--no-ff', 'main', '-m', 'chore: promote second batch');
    commit('fix: repair promoted content routing');
    const second = await preview();
    expect(second.version?.toString()).toBe('1.10.0');
    const notes = second.body.toString();
    expect(notes).toContain('second promoted feature');
    expect(notes).toContain('repair promoted content routing');
    expect(notes).not.toContain('first promoted feature');
    expect(notes.match(/second promoted feature/g)).toHaveLength(1);
    expect(notes).toContain('v1.9.0...v1.10.0');
    version = '1.10.0';
    releases.unshift({
      id: 3,
      tagName: 'v1.10.0',
      sha: commit('chore(release): release 1.10.0'),
      url: '',
      draft: false,
    });
    git('checkout', '-q', 'main');
    git('merge', '--no-ff', 'release', '-m', 'chore: back-merge second release and repair');
    git('checkout', '-q', 'release');
    expect(await preview()).toBeUndefined();
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
