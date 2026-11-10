import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  deferReleaseLabels,
  publishAndRefresh,
  publishReady,
  setInitialRelease,
  tagCommit,
  type ReleaseApi,
  type ReleaseCandidate,
} from '../../scripts/release';

const sha = 'a'.repeat(40);
const otherSha = 'b'.repeat(40);
const candidate: ReleaseCandidate = {
  sha,
  path: '.',
  pullRequest: { number: 25, sha },
  tag: { toString: () => 'v1.5.0', version: { toString: () => '1.5.0' } },
};
const createdReleases = () => [{ id: 99, tagName: candidate.tag.toString() }];
const artifacts = () => ({
  releaseExists: false,
  publish: vi.fn(async () => {}),
  dispose: vi.fn(async () => {}),
});
const api = (overrides: Partial<ReleaseApi> = {}): ReleaseApi => ({
  prepareArtifacts: async () => artifacts(),
  retryPublication: async () => {},
  published: async () => {},
  tag: async () => null,
  taggedObject: async () => ({ type: 'commit', sha }),
  jsonFile: async (path) => (path === 'package.json' ? { version: '1.5.0' } : { '.': '1.5.0' }),
  ...overrides,
});

describe('release commit checks', () => {
  it('requires validated Release PR artifacts after source metadata checks', async () => {
    const prepared = artifacts();
    const prepareArtifacts = vi.fn(async () => prepared);
    await expect(candidateReady(api({ prepareArtifacts }), candidate)).resolves.toBe(prepared);
    expect(prepareArtifacts).toHaveBeenCalledExactlyOnceWith(candidate);
    await expect(
      candidateReady(api({ prepareArtifacts: async () => null }), candidate),
    ).resolves.toBeNull();
  });

  it('does not prepare artifacts for mismatched version metadata', async () => {
    const prepareArtifacts = vi.fn(async () => artifacts());
    await expect(
      candidateReady(api({ prepareArtifacts, jsonFile: async () => ({}) }), candidate),
    ).rejects.toThrow('Version files');
    expect(prepareArtifacts).not.toHaveBeenCalled();
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
        expect(await this.buildReleases()).toEqual([{ ...candidate, draft: true }]);
        published = true;
        return createdReleases();
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
        api({ prepareArtifacts: async () => null }),
      ),
    ).resolves.toBe(0);
    expect(createReleases).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    [],
    [null],
    [{ id: 99, tagName: 'v9.0.0' }],
    [{ id: 0, tagName: 'v1.5.0' }],
    [{ id: 1.5, tagName: 'v1.5.0' }],
    [{ id: '99', tagName: 'v1.5.0' }],
    [...createdReleases(), ...createdReleases()],
  ])('rejects unexpected created release identity: %j', async (created) => {
    const prepared = artifacts();
    await expect(
      publishReady(
        { buildReleases: async () => [candidate], createReleases: async () => created },
        api({ prepareArtifacts: async () => prepared }),
      ),
    ).rejects.toThrow('Unexpected created release identity');
    expect(prepared.publish).not.toHaveBeenCalled();
    expect(prepared.dispose).toHaveBeenCalledOnce();
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

  it('publishes draft assets before requiring a tag and reports publication afterwards', async () => {
    const prepared = artifacts();
    let createdDraft = false;
    let released = false;
    prepared.publish.mockImplementation(async () => {
      expect(createdDraft).toBe(true);
      released = true;
    });
    const published = vi.fn(async () => {
      expect(prepared.publish).toHaveBeenCalledOnce();
    });
    await expect(
      publishReady(
        {
          buildReleases: async () => [candidate],
          async createReleases() {
            expect(await this.buildReleases()).toEqual([{ ...candidate, draft: true }]);
            createdDraft = true;
            return createdReleases();
          },
        },
        api({
          prepareArtifacts: async () => prepared,
          tag: async () => (released ? { type: 'commit', sha } : null),
          published,
        }),
      ),
    ).resolves.toBe(1);
    expect(published).toHaveBeenCalledExactlyOnceWith(candidate);
    expect(prepared.publish).toHaveBeenCalledExactlyOnceWith(99);
    expect(prepared.dispose).toHaveBeenCalledOnce();
  });

  it.each(['create', 'tag', 'assets'])(
    'restores a discoverable pending candidate and disposes artifacts after %s failure',
    async (stage) => {
      const prepared = artifacts();
      if (stage === 'assets') prepared.publish.mockRejectedValue(new Error('Asset upload failed'));
      const retryPublication = vi.fn(async () => {});
      const published = vi.fn(async () => {});
      await expect(
        publishReady(
          {
            buildReleases: async () => [candidate],
            createReleases: async () => {
              if (stage === 'create') throw new Error('Create failed');
              return createdReleases();
            },
          },
          api({
            prepareArtifacts: async () => prepared,
            tag: async () => (stage === 'tag' ? null : { type: 'commit', sha }),
            retryPublication,
            published,
          }),
        ),
      ).rejects.toThrow();
      expect(retryPublication).toHaveBeenCalledExactlyOnceWith(candidate);
      expect(prepared.dispose).toHaveBeenCalledOnce();
      expect(published).not.toHaveBeenCalled();
      if (stage === 'create') expect(prepared.publish).not.toHaveBeenCalled();
    },
  );

  it('keeps the original publication failure when pending-label recovery also fails', async () => {
    const prepared = artifacts();
    const original = new Error('Upload failed');
    const recovery = new Error('Labels failed');
    prepared.publish.mockRejectedValue(original);
    await expect(
      publishReady(
        {
          buildReleases: async () => [candidate],
          createReleases: async () => createdReleases(),
        },
        api({
          prepareArtifacts: async () => prepared,
          tag: async () => ({ type: 'commit', sha }),
          retryPublication: async () => {
            throw recovery;
          },
        }),
      ),
    ).rejects.toMatchObject({ errors: [original, recovery] });
    expect(prepared.dispose).toHaveBeenCalledOnce();
  });

  it('repairs assets on an existing matching Release without rebuilding', async () => {
    const prepared = artifacts();
    const duplicate = new Error('Already released');
    Object.setPrototypeOf(duplicate, Errors.DuplicateReleaseError.prototype);
    await expect(
      publishReady(
        {
          buildReleases: async () => [candidate],
          createReleases: async () => {
            throw duplicate;
          },
        },
        api({
          prepareArtifacts: async () => prepared,
          tag: async () => ({ type: 'commit', sha }),
        }),
      ),
    ).resolves.toBe(1);
    expect(prepared.publish).toHaveBeenCalledOnce();
    expect(prepared.dispose).toHaveBeenCalledOnce();
  });

  it('resumes an existing draft without creating a second draft', async () => {
    const prepared = artifacts();
    prepared.releaseExists = true;
    let released = false;
    prepared.publish.mockImplementation(async () => {
      released = true;
    });
    const createReleases = vi.fn();
    await expect(
      publishReady(
        { buildReleases: async () => [candidate], createReleases },
        api({
          prepareArtifacts: async () => prepared,
          tag: async () => (released ? { type: 'commit', sha } : null),
        }),
      ),
    ).resolves.toBe(1);
    expect(createReleases).not.toHaveBeenCalled();
    expect(prepared.publish).toHaveBeenCalledOnce();
    expect(prepared.dispose).toHaveBeenCalledOnce();
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
            return createdReleases();
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
        api({ prepareArtifacts: async () => null }),
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
          api({ prepareArtifacts: async () => null }),
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

it('restores the pending candidate before clearing the tagged label for retries', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json([]))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  const client = createReleaseApi('owner/repo', 'test-token', fetcher);
  await client.retryPublication(candidate);
  expect(fetcher.mock.calls[0][0]).toBe('https://api.github.com/repos/owner/repo/issues/25/labels');
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    method: 'POST',
    body: JSON.stringify({ labels: ['autorelease: pending'] }),
  });
  expect(fetcher.mock.calls[1][0]).toContain(encodeURIComponent('autorelease: tagged'));
  expect(fetcher.mock.calls[1][1]).toMatchObject({ method: 'DELETE' });
});

it('does not clear tagged when restoring pending fails', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 403 }));
  await expect(
    createReleaseApi('owner/repo', 'test-token', fetcher).retryPublication(candidate),
  ).rejects.toThrow('restore pending');
  expect(fetcher).toHaveBeenCalledOnce();
});

it('keeps an interrupted release discoverable by a fresh publisher until assets are ready', async () => {
  const labels = new Set(['autorelease: pending', 'keep']);
  const connect = () => {
    const github = {
      async removeIssueLabels(names: string[], number: number) {
        expect(number).toBe(25);
        for (const name of names) labels.delete(name);
      },
      async addIssueLabels(names: string[], number: number) {
        expect(number).toBe(25);
        for (const name of names) labels.add(name);
      },
    };
    deferReleaseLabels(github);
    return {
      // Release Please discovers merged candidates by their pending label.
      buildReleases: async () => (labels.has('autorelease: pending') ? [candidate] : []),
      async createReleases() {
        await github.removeIssueLabels(['autorelease: pending', 'keep'], 25);
        await github.addIssueLabels(['autorelease: tagged', 'other'], 25);
        return createdReleases();
      },
    };
  };
  await connect().createReleases();
  // No cleanup runs: discard the publisher exactly at the former interruption window.
  expect(labels).toEqual(new Set(['autorelease: pending', 'other']));
  const restarted = connect();
  expect(await restarted.buildReleases()).toEqual([candidate]);
  const prepared = artifacts();
  await expect(
    publishReady(
      restarted,
      api({
        prepareArtifacts: async () => prepared,
        tag: async () => ({ type: 'commit', sha }),
      }),
    ),
  ).resolves.toBe(1);
  expect(prepared.publish).toHaveBeenCalledOnce();
});

it.each([403, 204])(
  'finishes publication labels in order before emitting output (%s)',
  async (status) => {
    const directory = await mkdtemp(join(tmpdir(), 'release-label-output-'));
    const output = join(directory, 'output');
    vi.stubEnv('GITHUB_OUTPUT', output);
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      await expect(readFile(output)).rejects.toMatchObject({ code: 'ENOENT' });
      return init?.method === 'POST' ? Response.json([]) : new Response(null, { status });
    });
    try {
      const publication = createReleaseApi('owner/repo', 'test-token', fetcher).published(
        candidate,
      );
      if (status === 403) {
        await expect(publication).rejects.toThrow('clear pending');
        await expect(readFile(output)).rejects.toMatchObject({ code: 'ENOENT' });
      } else {
        await publication;
        expect(await readFile(output, 'utf8')).toContain('release_tag=v1.5.0');
      }
      expect(fetcher.mock.calls[0][1]).toMatchObject({
        method: 'POST',
        body: JSON.stringify({ labels: ['autorelease: tagged'] }),
      });
      expect(fetcher.mock.calls[1][0]).toContain(encodeURIComponent('autorelease: pending'));
      expect(fetcher.mock.calls[1][1]).toMatchObject({ method: 'DELETE' });
    } finally {
      vi.unstubAllEnvs();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

it('retains pending if adding the final tagged label fails', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 403 }));
  await expect(
    createReleaseApi('owner/repo', 'test-token', fetcher).published(candidate),
  ).rejects.toThrow('mark release PR tagged');
  expect(fetcher).toHaveBeenCalledOnce();
});

it('exports the release tag and merge SHA only at the publication boundary', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'release-output-'));
  const output = join(directory, 'output');
  vi.stubEnv('GITHUB_OUTPUT', output);
  try {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json([]));
    await createReleaseApi('owner/repo', 'test-token', fetcher).published(candidate);
    expect(await readFile(output, 'utf8')).toBe(`release_tag=v1.5.0\nrelease_sha=${sha}\n`);
  } finally {
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  }
});
