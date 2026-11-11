import { describe, expect, it, vi } from 'vite-plus/test';
import { GitHub, Manifest } from 'release-please';
import { Version } from 'release-please/build/src/version.js';
import { setInitialRelease } from '../../scripts/release';
import { prepareReleaseManifest } from '../../scripts/release-recovery';

const sha = (n: number) => n.toString().repeat(40);
function historyFixture() {
  const releases = [{ id: 1, tagName: 'v1.8.2', sha: sha(2), url: '', draft: false }];
  const commits = [
    { sha: sha(5), message: 'fix: repair the failed candidate', files: ['scripts/release.ts'] },
    { sha: sha(4), message: 'chore(main): release 1.8.3', files: ['package.json'] },
    { sha: sha(3), message: 'fix: unpublished search improvement', files: ['src/search.ts'] },
    { sha: sha(2), message: 'chore(main): release 1.8.2', files: ['package.json'] },
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
    const manifest = await Manifest.fromManifest(fixture.github, 'main');
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
    const manifest = await Manifest.fromManifest(fixture.github, 'main');
    const pending = { labels: ['autorelease: pending'] };
    vi.spyOn(fixture.github, 'pullRequestIterator').mockImplementation(
      async function* (_branch, state) {
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
    const manifest = await Manifest.fromManifest(fixture.github, 'main');
    await expect(prepareReleaseManifest(fixture.github, manifest, fixture.api)).resolves.toBe(true);
    expect(manifest.releasedVersions['.']!.toString()).toBe('1.8.3');
    expect(manifest.repositoryConfig['.']!.releaseAs).toBeUndefined();
  });

  it.each(['1.8.2', '1.8.3', '1.8.4-beta.1'])(
    'rejects next version %s rather than reusing a retired version',
    async (releaseAs) => {
      const fixture = historyFixture();
      const manifest = await Manifest.fromManifest(fixture.github, 'main');
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
      const manifest = await Manifest.fromManifest(fixture.github, 'main');
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
      const manifest = await Manifest.fromManifest(fixture.github, 'main');
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
    const manifest = await Manifest.fromManifest(fixture.github, 'main');
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
      async function* (_branch, state) {
        expect(state).toBe('MERGED');
        yield { labels: ['autorelease: pending'] } as never;
      },
    );
    const manifest = await Manifest.fromManifest(fixture.github, 'main');
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
    const manifest = await Manifest.fromManifest(fixture.github, 'main');
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
      const manifest = await Manifest.fromManifest(fixture.github, 'main');
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
