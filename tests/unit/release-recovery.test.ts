import { describe, expect, it, vi } from 'vite-plus/test';
import { GitHub, Manifest } from 'release-please';
import { Node } from 'release-please/build/src/strategies/node.js';
import { parseConventionalCommits } from 'release-please/build/src/commit.js';
import { PullRequestBody } from 'release-please/build/src/util/pull-request-body.js';
import { TagName } from 'release-please/build/src/util/tag-name.js';
import { Version } from 'release-please/build/src/version.js';
import type { PullRequest } from 'release-please/build/src/pull-request.js';

// Exercise the installed version tool's pending gate, PR parser, Node version
// calculation and PR creation. External history/file reads are local fixtures.
async function recoveryFixture(labels: string[]) {
  const old: PullRequest = {
    number: 25,
    headBranchName: 'release-please--branches--release--components--sionrbot-blog',
    baseBranchName: 'release',
    title: 'chore(release): release sionrbot-blog 1.8.3',
    body: new PullRequestBody([
      { version: Version.parse('1.8.3'), notes: 'Unpublished candidate' },
    ]).toString(),
    labels,
    files: [],
    sha: 'a'.repeat(40),
  };
  const createPullRequest = vi.fn(async (request: PullRequest) => ({ ...request, number: 27 }));
  const boundary = {
    repository: { owner: 'fixture', repo: 'blog', defaultBranch: 'main' },
    async *pullRequestIterator(branch: string, state: string) {
      expect(branch).toBe('release');
      if (state === 'MERGED') yield old;
    },
    createPullRequest,
  };
  // Any unprovided API (release/tag/asset writes included) fails immediately.
  const github = boundary as unknown as GitHub;
  const strategy = new Node({
    github,
    targetBranch: 'release',
    packageName: 'sionrbot-blog',
    includeComponentInTag: false,
  });
  const repaired = await strategy.buildReleasePullRequest(
    parseConventionalCommits([
      {
        sha: 'b'.repeat(40),
        message: 'fix: repair production search routing',
        files: ['src/search.ts'],
      },
    ]),
    {
      tag: new TagName(Version.parse('1.8.3')),
      sha: old.sha!,
      notes: '',
    },
    false,
    ['autorelease: pending'],
  );
  if (!repaired) throw new Error('Node strategy did not produce the repaired candidate');
  const manifest = new Manifest(github, 'release', { '.': { releaseType: 'node' } }, {});
  // History discovery is not this test's contract. Pass its strategy result into
  // the real maintenance gate instead of mocking the gate or label filtering.
  vi.spyOn(manifest, 'buildPullRequests').mockResolvedValue([repaired]);
  return { manifest, old, repaired, createPullRequest };
}

describe('version tool recovery', () => {
  it('blocks a new version while the merged unpublished candidate remains pending, then permits explicit retirement', async () => {
    const fixture = await recoveryFixture(['autorelease: pending']);
    await expect(fixture.manifest.createPullRequests()).resolves.toEqual([]);
    expect(fixture.createPullRequest).not.toHaveBeenCalled();

    // Models the operator's separately authorized removal on this one PR.
    fixture.old.labels.splice(0);
    const created = await fixture.manifest.createPullRequests();
    expect(created).toHaveLength(1);
    expect(fixture.createPullRequest).toHaveBeenCalledTimes(1);
    const request = fixture.createPullRequest.mock.calls[0]![0];
    expect(request.body).toContain('repair production search routing');
    expect(fixture.repaired.version?.toString()).toBe('1.8.4');
    expect(request.baseBranchName).toBe('release');
    expect(request.labels).toContain('autorelease: pending');
  });

  it('prepares a subsequent fix after publication without changing the old PR or invoking history writes', async () => {
    const fixture = await recoveryFixture(['autorelease: tagged']);
    const before = structuredClone(fixture.old);
    await expect(fixture.manifest.createPullRequests()).resolves.toHaveLength(1);
    expect(fixture.old).toEqual(before);
    expect(fixture.repaired.version?.toString()).toBe('1.8.4');
    expect(fixture.createPullRequest.mock.calls[0]![0].body).toContain(
      'repair production search routing',
    );
  });
});
