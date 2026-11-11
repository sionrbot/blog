import { describe, expect, it, vi } from 'vite-plus/test';
import {
  fixedCandidate,
  fixedReleaseApi,
  mayDeploy,
  publishFixed,
  releaseNotes,
  type FixedCandidate,
  type FixedReleaseApi,
  type MergedPullRequest,
} from '../../scripts/release-fixed';

const sha = 'a'.repeat(40);
const pr: MergedPullRequest = {
  number: 10,
  merged: true,
  merge_commit_sha: sha,
  base: { ref: 'main', repo: { full_name: 'owner/blog' } },
  head: {
    ref: 'release-please--branches--main--components--sionrbot-blog',
    repo: { full_name: 'owner/blog' },
  },
  labels: [{ name: 'autorelease: pending' }],
};
const candidate: FixedCandidate = {
  repository: 'owner/blog',
  pr: 10,
  sha,
  version: '2.0.0',
  tag: 'v2.0.0',
};
const published = { id: 5, tag_name: 'v2.0.0', draft: false, prerelease: false };
function api(overrides: Partial<FixedReleaseApi> = {}): FixedReleaseApi {
  return {
    pullRequest: async () => pr,
    file: async (path) =>
      path === 'package.json'
        ? '{"version":"2.0.0"}'
        : path === 'CHANGELOG.md'
          ? '## [2.0.0](url)\n\nFixed search.\n\n## 1.0.0\nOld notes.'
          : '{".":"2.0.0"}',
    tagCommit: async () => null,
    release: async () => null,
    latest: async () => null,
    create: async () => {},
    markPublished: async () => {},
    ...overrides,
  };
}
const event = { action: 'closed', pull_request: pr };

describe('fixed release candidate', () => {
  it('reads versions only at the original merge SHA on every retry', async () => {
    const source = api();
    const file = vi.spyOn(source, 'file');
    expect(await fixedCandidate(source, 'owner/blog', event)).toEqual(candidate);
    expect(await fixedCandidate(source, 'owner/blog', event)).toEqual(candidate);
    expect(file.mock.calls).toEqual([
      ['package.json', sha],
      ['.release-please-manifest.json', sha],
      ['package.json', sha],
      ['.release-please-manifest.json', sha],
    ]);
  });
  it.each([
    { ...pr, merged: false },
    { ...pr, base: { ...pr.base, ref: 'other' } },
    { ...pr, head: { ...pr.head, repo: { full_name: 'fork/blog' } } },
    { ...pr, head: { ...pr.head, ref: 'feature' } },
    { ...pr, merge_commit_sha: 'main' },
  ])('rejects unsupported source %#', async (pull_request) => {
    await expect(fixedCandidate(api(), 'owner/blog', { ...event, pull_request })).rejects.toThrow();
  });
  it('rejects remote merge changes and inconsistent versions', async () => {
    await expect(
      fixedCandidate(
        api({ pullRequest: async () => ({ ...pr, merge_commit_sha: 'b'.repeat(40) }) }),
        'owner/blog',
        event,
      ),
    ).rejects.toThrow('original event');
    await expect(
      fixedCandidate(
        api({ file: async () => '{"version":"2.0.0",".":"2.0.1"}' }),
        'owner/blog',
        event,
      ),
    ).rejects.toThrow('version files');
  });
  it('blocks retired unpublished candidates, while published retries preserve history', async () => {
    const retired = api({ pullRequest: async () => ({ ...pr, labels: [] }) });
    await expect(fixedCandidate(retired, 'owner/blog', event)).rejects.toThrow('retired');
    await expect(
      fixedCandidate(
        api({ ...retired, release: async () => published, tagCommit: async () => sha }),
        'owner/blog',
        event,
      ),
    ).resolves.toEqual(candidate);
  });
  it('blocks conflicting tags and drafts without deleting them', async () => {
    await expect(
      fixedCandidate(api({ tagCommit: async () => 'b'.repeat(40) }), 'owner/blog', event),
    ).rejects.toThrow('Conflicting tag');
    await expect(
      fixedCandidate(
        api({ release: async () => ({ ...published, draft: true }) }),
        'owner/blog',
        event,
      ),
    ).rejects.toThrow('reconciliation');
  });
});

describe('publication and deployment', () => {
  it('publishes fixed notes and SHA once, then retries only label completion', async () => {
    let exists = false;
    const create = vi.fn(async () => {
      exists = true;
    });
    const markPublished = vi.fn(async () => {});
    const source = api({
      create,
      markPublished,
      release: async () => (exists ? published : null),
      tagCommit: async () => (exists ? sha : null),
    });
    await publishFixed(source, candidate);
    await publishFixed(source, candidate);
    expect(create).toHaveBeenCalledExactlyOnceWith(candidate, 'Fixed search.');
    expect(markPublished).toHaveBeenCalledTimes(2);
  });
  it('reuses a matching existing tag and blocks conflicting tags before writes', async () => {
    let exists = false;
    const create = vi.fn(async () => {
      exists = true;
    });
    const source = api({
      create,
      tagCommit: async () => sha,
      release: async () => (exists ? published : null),
    });
    await publishFixed(source, candidate);
    expect(create).toHaveBeenCalledOnce();
    create.mockClear();
    await expect(
      publishFixed(api({ create, tagCommit: async () => 'b'.repeat(40) }), candidate),
    ).rejects.toThrow('Conflicting');
    expect(create).not.toHaveBeenCalled();
  });
  it('does not publish an explicitly retired candidate or rewrite a draft', async () => {
    const create = vi.fn();
    await expect(
      publishFixed(api({ create, pullRequest: async () => ({ ...pr, labels: [] }) }), candidate),
    ).rejects.toThrow('retired');
    await expect(
      publishFixed(
        api({ create, release: async () => ({ ...published, draft: true }) }),
        candidate,
      ),
    ).rejects.toThrow('consistent');
    expect(create).not.toHaveBeenCalled();
  });
  it('allows only the latest stable published tag to deploy', async () => {
    const source = api({
      tagCommit: async () => sha,
      release: async () => published,
      latest: async () => published,
    });
    expect(await mayDeploy(source, candidate)).toBe(true);
    expect(
      await mayDeploy(
        { ...source, latest: async () => ({ ...published, tag_name: 'v2.1.0' }) },
        candidate,
      ),
    ).toBe(false);
    await expect(
      mayDeploy({ ...source, tagCommit: async () => 'b'.repeat(40) }, candidate),
    ).rejects.toThrow('Conflicting');
  });
  it('retains the published version if label completion fails', async () => {
    const create = vi.fn();
    await expect(
      publishFixed(
        api({
          create,
          tagCommit: async () => sha,
          release: async () => published,
          markPublished: async () => {
            throw new Error('network');
          },
        }),
        candidate,
      ),
    ).rejects.toThrow('network');
    expect(create).not.toHaveBeenCalled();
  });
  it('requires version-specific changelog notes', () => {
    expect(() => releaseNotes('## 1.0.0\nOld.', '2.0.0')).toThrow('Missing');
  });
  it('uses explicit latest semantics and fixed target in native GitHub publication', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 201 }));
    await fixedReleaseApi('owner/blog', 'test-token', fetcher).create(candidate, 'Notes');
    expect(fetcher.mock.calls[0]).toEqual([
      'https://api.github.com/repos/owner/blog/releases',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          tag_name: 'v2.0.0',
          target_commitish: sha,
          name: 'v2.0.0',
          body: 'Notes',
          draft: false,
          prerelease: false,
          make_latest: 'legacy',
        }),
      }),
    ]);
  });
});

describe('native release API boundaries', () => {
  it('resolves annotated tags to the underlying commit before identity checks', async () => {
    const objectSha = 'c'.repeat(40);
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/git/ref/tags/v2.0.0')) {
        return Response.json({ object: { type: 'tag', sha: objectSha } });
      }
      if (path.endsWith(`/git/tags/${objectSha}`)) {
        return Response.json({ object: { type: 'commit', sha } });
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    await expect(
      fixedReleaseApi('owner/blog', 'test-token', fetcher).tagCommit('v2.0.0'),
    ).resolves.toBe(sha);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('distinguishes missing tags from authorization or service failures', async () => {
    const missing = fixedReleaseApi(
      'owner/blog',
      'test-token',
      async () => new Response('', { status: 404 }),
    );
    await expect(missing.tagCommit('v2.0.0')).resolves.toBeNull();
    for (const status of [403, 500]) {
      const failed = fixedReleaseApi(
        'owner/blog',
        'test-token',
        async () => new Response('', { status }),
      );
      await expect(failed.tagCommit('v2.0.0')).rejects.toThrow(String(status));
      await expect(failed.latest()).rejects.toThrow(String(status));
    }
  });
});
