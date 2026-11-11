import type { GitHub, Manifest } from 'release-please';
import { Version } from 'release-please/build/src/version.js';
import type { FixedReleaseApi } from './release-fixed.ts';

type Recovery = { from: string; releaseAs: string };
type HistoryApi = Pick<FixedReleaseApi, 'release' | 'latest' | 'tagCommit'>;
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

// Keep automatic maintenance from bootstrapping through published history when
// the manifest records a merged version that never acquired a public Release.
export async function prepareReleaseManifest(
  github: GitHub,
  manifest: Manifest,
  api: HistoryApi,
  recovery?: Recovery,
): Promise<boolean> {
  const recorded = manifest.releasedVersions['.'];
  if (!recorded || recorded.toString() === '1.4.1') {
    if (recovery) throw new Error('Recovery requires an existing project version');
    return true;
  }
  const currentTag = `v${recorded}`;
  const currentRelease = await api.release(currentTag);
  if (!recovery && currentRelease && !currentRelease.draft && !currentRelease.prerelease)
    return true;

  // Preserve the normal pending gate, including while a merged candidate is
  // still validating. A closed, unmerged PR is not a pending release.
  for await (const pr of github.pullRequestIterator('main', 'MERGED')) {
    if (pr.labels.includes('autorelease: pending')) return false;
  }
  if (!recovery) {
    throw new Error(
      `No public stable Release for ${currentTag}; inspect and retire the unpublished candidate, then use --recover-from and --release-as`,
    );
  }
  if (currentRelease || (await api.tagCommit(currentTag))) {
    throw new Error('Recovery requires an unpublished manifest version without a Release or tag');
  }
  if (
    !/^v/.test(recovery.from) ||
    !stableVersion.test(recovery.from.slice(1)) ||
    !stableVersion.test(recovery.releaseAs)
  ) {
    throw new Error('Recovery requires a v-prefixed stable base tag and a stable next version');
  }
  const previous = Version.parse(recovery.from.slice(1));
  const next = Version.parse(recovery.releaseAs);
  if (previous.compare(recorded) >= 0 || next.compare(recorded) <= 0) {
    throw new Error('Recovery base must precede the manifest and next version must exceed it');
  }
  const release = await api.release(recovery.from);
  const latest = await api.latest();
  const boundary = await api.tagCommit(recovery.from);
  if (
    !release ||
    release.draft ||
    release.prerelease ||
    latest?.tag_name !== recovery.from ||
    !boundary
  ) {
    throw new Error('Recovery base must be the latest public stable Release with an existing tag');
  }
  if ((await api.release(`v${next}`)) || (await api.tagCommit(`v${next}`))) {
    throw new Error('Recovery next version already has a Release or tag');
  }
  let discovered = false;
  for await (const entry of github.releaseIterator({ maxResults: manifest.releaseSearchDepth })) {
    if (entry.tagName === recovery.from && !entry.draft && entry.sha === boundary)
      discovered = true;
  }
  let reachable = false;
  for await (const commit of github.mergeCommitIterator('main', {
    maxResults: manifest.commitSearchDepth,
  })) {
    if (commit.sha === boundary) {
      reachable = true;
      break;
    }
  }
  if (!discovered || !reachable)
    throw new Error(
      'Recovery boundary is missing or inconsistent within the configured history search',
    );

  // Real Manifest discovery now finds this published tag, excludes its commit
  // and older history, and uses it for the comparison URL. No tracked override
  // or published history is changed; every refresh repeats explicit recovery.
  manifest.releasedVersions['.'] = previous;
  manifest.repositoryConfig['.'].releaseAs = next.toString();
  return true;
}
