import { describe, expect, it, vi } from 'vite-plus/test';
import { Errors } from 'release-please';
import { DefaultChangelogNotes } from 'release-please/build/src/changelog-notes/default.js';
import { Changelog } from 'release-please/build/src/updaters/changelog.js';
import { PackageJson } from 'release-please/build/src/updaters/node/package-json.js';
import { Version } from 'release-please/build/src/version.js';
import {
  candidateReady,
  createFormattedPullRequests,
  createReleaseApi,
  latestPushRun,
  publishAndRefresh,
  publishReady,
  setInitialRelease,
  tagCommit,
  type ReleaseApi,
  type ReleaseCandidate,
  type WorkflowRun,
} from '../../scripts/release';

const sha = 'a'.repeat(40);
const otherSha = 'b'.repeat(40);
const candidate: ReleaseCandidate = {
  sha,
  path: '.',
  pullRequest: { number: 25, sha },
  tag: { toString: () => 'v1.5.0', version: { toString: () => '1.5.0' } },
};
const run = (overrides: Partial<WorkflowRun> = {}): WorkflowRun => ({
  id: 1,
  run_number: 1,
  run_attempt: 1,
  head_sha: sha,
  head_branch: 'main',
  event: 'push',
  status: 'completed',
  conclusion: 'success',
  ...overrides,
});
const api = (overrides: Partial<ReleaseApi> = {}): ReleaseApi => ({
  runs: async () => [run()],
  tag: async () => null,
  taggedObject: async () => ({ type: 'commit', sha }),
  jsonFile: async (path) => (path === 'package.json' ? { version: '1.5.0' } : { '.': '1.5.0' }),
  ...overrides,
});

describe('release commit checks', () => {
  it('requires both workflows to pass for the exact merge commit', async () => {
    const runs = vi.fn(async () => [run()]);
    await expect(candidateReady(api({ runs }), candidate)).resolves.toBe(true);
    expect(runs.mock.calls).toEqual([
      ['ci.yml', sha],
      ['e2e.yml', sha],
    ]);
    await expect(
      candidateReady(
        api({
          runs: async (workflow) =>
            workflow === 'ci.yml' ? [run()] : [run({ head_sha: otherSha })],
        }),
        candidate,
      ),
    ).resolves.toBe(false);
  });

  it('does not accept PR runs, another branch, or an older successful run', () => {
    expect(
      latestPushRun([run({ event: 'pull_request' }), run({ head_branch: 'topic' })], sha),
    ).toBeUndefined();
    expect(
      latestPushRun([run(), run({ id: 2, run_number: 2, conclusion: 'failure' })], sha)?.conclusion,
    ).toBe('failure');
    expect(
      latestPushRun([run(), run({ run_attempt: 2, status: 'in_progress', conclusion: null })], sha)
        ?.status,
    ).toBe('in_progress');
  });

  it('waits for a failed or running latest attempt', async () => {
    for (const latest of [
      run({ run_attempt: 2, conclusion: 'failure' }),
      run({ run_attempt: 2, status: 'in_progress', conclusion: null }),
    ]) {
      await expect(
        candidateReady(api({ runs: async () => [run(), latest] }), candidate),
      ).resolves.toBe(false);
    }
  });

  it('rejects mismatched merge commits and version files', async () => {
    await expect(
      candidateReady(api(), { ...candidate, pullRequest: { number: 25, sha: otherSha } }),
    ).rejects.toThrow('Invalid release commit');
    await expect(
      candidateReady(
        api({ jsonFile: async () => ({ version: '1.4.1', '.': '1.5.0' }) }),
        candidate,
      ),
    ).rejects.toThrow('Version files');
  });

  it('peels nested annotated tags and rejects a conflicting tag', async () => {
    const taggedObject = vi.fn(async (objectSha: string) =>
      objectSha === 'outer' ? { type: 'tag', sha: 'inner' } : { type: 'commit', sha },
    );
    await expect(
      tagCommit(api({ tag: async () => ({ type: 'tag', sha: 'outer' }), taggedObject }), 'v1.5.0'),
    ).resolves.toBe(sha);
    expect(taggedObject).toHaveBeenCalledTimes(2);
    await expect(
      candidateReady(api({ tag: async () => ({ type: 'commit', sha: otherSha }) }), candidate),
    ).rejects.toThrow('different commit');
  });

  it('freezes approved candidates so publishing cannot rescan a newly merged PR', async () => {
    const unchecked = { ...candidate, sha: otherSha, pullRequest: { number: 26, sha: otherSha } };
    const scan = vi.fn().mockResolvedValueOnce([candidate]).mockResolvedValue([unchecked]);
    let published = false;
    const manifest = {
      buildReleases: scan,
      async createReleases() {
        expect(await this.buildReleases()).toEqual([candidate]);
        published = true;
      },
    };
    await expect(
      publishReady(
        manifest,
        api({ tag: async () => (published ? { type: 'commit', sha } : null) }),
      ),
    ).resolves.toBe(1);
    expect(scan).toHaveBeenCalledTimes(1);
  });

  it('does not publish while checks are missing', async () => {
    const createReleases = vi.fn();
    await expect(
      publishReady(
        { buildReleases: async () => [candidate], createReleases },
        api({ runs: async () => [] }),
      ),
    ).resolves.toBe(0);
    expect(createReleases).not.toHaveBeenCalled();
  });

  it('recovers only a duplicate release with the expected tag', async () => {
    const duplicate = new Error('Release already exists');
    Object.setPrototypeOf(duplicate, Errors.DuplicateReleaseError.prototype);
    const manifest = {
      buildReleases: async () => [candidate],
      createReleases: async () => {
        throw duplicate;
      },
    };
    await expect(
      publishReady(manifest, api({ tag: async () => ({ type: 'commit', sha }) })),
    ).resolves.toBe(1);
    await expect(publishReady(manifest, api())).rejects.toThrow('has no tag');
    await expect(
      publishReady(
        {
          ...manifest,
          createReleases: async () => {
            throw new Error('Label update failed');
          },
        },
        api({ tag: async () => ({ type: 'commit', sha }) }),
      ),
    ).rejects.toThrow('Label update failed');
  });

  it('rejects multiple pending releases before any publishing begins', async () => {
    const createReleases = vi.fn();
    await expect(
      publishReady({ buildReleases: async () => [candidate, candidate], createReleases }, api()),
    ).rejects.toThrow('Multiple pending releases');
    expect(createReleases).not.toHaveBeenCalled();
  });

  it('rebuilds the next release PR from fresh state after publishing', async () => {
    let published = false;
    const createPullRequests = vi.fn();
    const refreshed = {
      releasedVersions: { '.': { toString: () => '1.5.0' } },
      repositoryConfig: { '.': {} as { releaseAs?: string } },
      buildPullRequests: async () => [],
      createPullRequests,
    };
    const reload = vi.fn(async () => {
      expect(published).toBe(true);
      return refreshed;
    });
    await expect(
      publishAndRefresh(
        {
          buildReleases: async () => [candidate],
          createReleases: async () => {
            published = true;
          },
        },
        api({ tag: async () => (published ? { type: 'commit', sha } : null) }),
        reload,
      ),
    ).resolves.toBe(1);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(createPullRequests).toHaveBeenCalledTimes(1);
    expect(refreshed.repositoryConfig['.'].releaseAs).toBeUndefined();
  });

  it('does not refresh release PRs before a waiting candidate is published', async () => {
    const reload = vi.fn();
    await expect(
      publishAndRefresh(
        {
          buildReleases: async () => [candidate],
          createReleases: vi.fn(),
        },
        api({ runs: async () => [] }),
        reload,
      ),
    ).resolves.toBe(0);
    expect(reload).not.toHaveBeenCalled();
  });

  it('automatic sync refreshes fresh main even when no release can be published', async () => {
    for (const candidates of [[], [candidate]]) {
      const createPullRequests = vi.fn();
      const reload = vi.fn(async () => ({
        releasedVersions: { '.': { toString: () => '1.5.0' } },
        repositoryConfig: { '.': {} },
        buildPullRequests: async () => [],
        createPullRequests,
      }));
      await expect(
        publishAndRefresh(
          {
            buildReleases: async () => candidates,
            createReleases: vi.fn(),
          },
          api({ runs: async () => [] }),
          reload,
          true,
        ),
      ).resolves.toBe(0);
      expect(reload).toHaveBeenCalledTimes(1);
      expect(createPullRequests).toHaveBeenCalledTimes(1);
    }
  });

  it('automatic sync does not refresh after publication fails', async () => {
    const reload = vi.fn();
    await expect(
      publishAndRefresh(
        {
          buildReleases: async () => [candidate],
          createReleases: async () => {
            throw new Error('Release failed');
          },
        },
        api(),
        reload,
        true,
      ),
    ).rejects.toThrow('Release failed');
    expect(reload).not.toHaveBeenCalled();
  });
});

it('only overrides the first version while the recorded version is 1.4.1', () => {
  for (const version of ['1.4.1', '1.5.0']) {
    const manifest = {
      releasedVersions: { '.': { toString: () => version } },
      repositoryConfig: { '.': {} as { releaseAs?: string } },
    };
    setInitialRelease(manifest);
    expect(manifest.repositoryConfig['.'].releaseAs).toBe(
      version === '1.4.1' ? '1.5.0' : undefined,
    );
    expect(manifest.releasedVersions['.']?.toString()).toBe(
      version === '1.4.1' ? undefined : version,
    );
  }
});

it('renders first-release notes without comparing against the inherited theme tag', async () => {
  const manifest = {
    releasedVersions: { '.': { toString: () => '1.4.1' } },
    repositoryConfig: { '.': {} as { releaseAs?: string } },
  };
  setInitialRelease(manifest);
  const previousVersion = manifest.releasedVersions['.']?.toString();
  const notes = await new DefaultChangelogNotes().buildNotes(
    [
      {
        sha,
        message: 'feat: add bilingual blog routes',
        bareMessage: 'add bilingual blog routes',
        type: 'feat',
        scope: null,
        notes: [],
        references: [],
        breaking: false,
      },
    ],
    {
      owner: 'sionrbot',
      repository: 'blog',
      targetBranch: 'main',
      version: manifest.repositoryConfig['.'].releaseAs!,
      currentTag: `v${manifest.repositoryConfig['.'].releaseAs}`,
      previousTag: previousVersion ? `v${previousVersion}` : undefined,
    },
  );
  expect(notes).toContain('1.5.0');
  expect(notes).toContain('add bilingual blog routes');
  expect(notes).toContain(`https://github.com/sionrbot/blog/commit/${sha}`);
  expect(notes).not.toContain('/compare/');
  expect(notes).not.toContain('v1.4.1');
});

it('formats real release-please updates before creating the release PR', async () => {
  const version = Version.parse('1.5.0');
  const updates = [
    {
      path: 'CHANGELOG.md',
      createIfMissing: true,
      updater: new Changelog({ version, changelogEntry: '## 1.5.0\n\n\n* add bilingual routes' }),
    },
    { path: 'package.json', createIfMissing: false, updater: new PackageJson({ version }) },
  ];
  const scan = vi.fn(async () => [{ updates }]);
  const manifest = {
    buildPullRequests: scan,
    async createPullRequests() {
      const [prepared] = await this.buildPullRequests();
      const changelog = prepared.updates[0].updater.updateContent('# Changelog\n');
      const pkg = prepared.updates[1].updater.updateContent('{"name":"example","version":"1.4.1"}');
      expect(changelog).toContain('\n- add bilingual routes\n');
      expect(changelog).not.toContain('\n\n\n');
      expect(pkg).toBe('{\n  "name": "example",\n  "version": "1.5.0"\n}\n');
    },
  };
  await createFormattedPullRequests(manifest);
  expect(scan).toHaveBeenCalledTimes(1);
});

it('paginates workflow runs without filtering out unsuccessful states', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({ workflow_runs: Array.from({ length: 100 }, () => run()) }),
    )
    .mockResolvedValueOnce(
      Response.json({ workflow_runs: [run({ run_number: 2, conclusion: 'failure' })] }),
    );
  const client = createReleaseApi('owner/repo', 'test-token', fetcher);
  const runs = await client.runs('ci.yml', sha);
  expect(runs).toHaveLength(101);
  expect(latestPushRun(runs, sha)?.conclusion).toBe('failure');
  expect(fetcher.mock.calls[1][0]).toContain('page=2');
  expect(fetcher.mock.calls[0][0]).not.toContain('status=');
});
