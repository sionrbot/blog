import { describe, expect, it } from 'vite-plus/test';
import {
  repositoryReady,
  releaseRunSnapshot,
  type ReleaseRun,
  type ReleaseJob,
} from '../../scripts/check-closeout';

const ready = {
  clean: true,
  localStable: true,
  branch: 'main',
  base: 'main',
  localBase: 'release-sha',
  remoteBefore: 'release-sha',
  remoteAfter: 'release-sha',
  mergeOnBase: true,
  pr: {
    number: 39,
    state: 'MERGED',
    url: '',
    baseRefName: 'main',
    headRefName: 'feature',
    headRefOid: 'squashed-sha',
    mergeCommit: { oid: 'feature-merge' },
  },
};

describe('closeout repository snapshot', () => {
  it('accepts a squash merge followed by a synchronized release commit', () => {
    expect(repositoryReady(ready)).toBe(true);
  });
  it.each([
    { localBase: 'feature-merge' },
    { remoteAfter: 'concurrent-merge' },
    { clean: false },
    { localStable: false },
    { branch: 'feature' },
    { mergeOnBase: false },
    { pr: { ...ready.pr, state: 'CLOSED' } },
    { pr: { ...ready.pr, baseRefName: 'other' } },
  ])('rejects incomplete state %j', (change) => {
    expect(repositoryReady({ ...ready, ...change })).toBe(false);
  });
});

const candidateSha = 'a'.repeat(40);
const executionSha = 'b'.repeat(40);
const contentRun: ReleaseRun = {
  id: 123,
  run_attempt: 2,
  path: '.github/workflows/release.yml',
  event: 'workflow_dispatch',
  display_title: `content ${candidateSha}`,
  head_sha: executionSha,
  head_branch: 'release',
  status: 'completed',
  conclusion: 'failure',
  html_url: 'https://github.com/owner/repo/actions/runs/123',
};
const targetJob = (name: string, conclusion: string): ReleaseJob => ({
  name,
  status: 'completed',
  conclusion,
  html_url: `https://github.com/owner/repo/actions/jobs/${name}`,
  steps: [
    { name: 'Deploy', status: 'completed', conclusion: 'success' },
    { name: 'Smoke', status: 'completed', conclusion },
  ],
});

describe('explicit release run snapshot', () => {
  it('separates dispatch candidate from workflow execution source and preserves target smoke evidence', () => {
    const jobs = [
      targetJob('prepare', 'success'),
      targetJob('pages', 'success'),
      targetJob('workers', 'failure'),
    ];
    const snapshot = releaseRunSnapshot(contentRun, jobs);
    expect(snapshot.candidate).toEqual({
      kind: 'content',
      sha: candidateSha,
      identitySource: 'workflow run-name',
    });
    expect(snapshot.executionSha).toBe(executionSha);
    expect(snapshot.pages?.conclusion).toBe('success');
    expect(snapshot.workers?.steps?.[1]?.conclusion).toBe('failure');
    expect(snapshot.run.run_attempt).toBe(2);
  });

  it('does not turn missing or skipped target jobs into success', () => {
    const snapshot = releaseRunSnapshot(contentRun, [targetJob('pages', 'skipped')]);
    expect(snapshot.preparation).toBeNull();
    expect(snapshot.pages?.conclusion).toBe('skipped');
    expect(snapshot.workers).toBeNull();
  });

  it('accepts fixed software identity without treating the event head as its merge SHA', () => {
    const snapshot = releaseRunSnapshot(
      { ...contentRun, event: 'pull_request', display_title: `software ${candidateSha}` },
      [],
    );
    expect(snapshot.candidate.kind).toBe('software');
    expect(snapshot.candidate.sha).toBe(candidateSha);
  });

  it.each([
    { path: '.github/workflows/ci.yml' },
    { display_title: 'content main' },
    { display_title: `software ${candidateSha}` },
    { head_branch: 'main' },
    { event: 'push' },
    { run_attempt: 0 },
  ])('rejects an unrecognized or mismatched run identity %j', (change) => {
    expect(() => releaseRunSnapshot({ ...contentRun, ...change }, [])).toThrow();
  });

  it('rejects ambiguous jobs rather than selecting a successful duplicate', () => {
    expect(() =>
      releaseRunSnapshot(contentRun, [
        targetJob('pages', 'success'),
        targetJob('pages', 'failure'),
      ]),
    ).toThrow('Ambiguous');
  });
});
