import { describe, expect, it } from 'vite-plus/test';
import { repositoryReady } from '../../scripts/check-closeout';

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
