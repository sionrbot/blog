import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { formatReleaseFile } from './release-format.ts';
import { prepareReleaseManifest } from './release-recovery.ts';
import { fixedReleaseApi } from './release-fixed.ts';
export { formatReleaseFile } from './release-format.ts';
import { GitHub, Manifest, type ReleasePullRequest } from 'release-please';

export function setInitialRelease(manifest: {
  releasedVersions: Record<string, { toString(): string }>;
  repositoryConfig: Record<string, { releaseAs?: string }>;
}): void {
  if (manifest.releasedVersions['.']?.toString() === '1.4.1') {
    manifest.repositoryConfig['.'].releaseAs = '1.5.0';
    // 1.4.1 is inherited theme metadata, not a release in this repository.
    // Do not generate a comparison link to a nonexistent origin tag.
    delete manifest.releasedVersions['.'];
  }
}

export async function createFormattedPullRequests<
  T extends Pick<ReleasePullRequest, 'updates'>,
>(manifest: {
  buildPullRequests(): Promise<T[]>;
  createPullRequests(): Promise<unknown>;
}): Promise<unknown> {
  const candidates = await manifest.buildPullRequests();
  for (const candidate of candidates) {
    for (const update of candidate.updates) {
      const updater = update.updater;
      update.updater = {
        updateContent(content, logger) {
          return formatReleaseFile(update.path, updater.updateContent(content, logger));
        },
      };
    }
  }
  // Keep the formatted updaters when createPullRequests internally builds again.
  // Its pending-release and existing-PR checks still run normally.
  manifest.buildPullRequests = async () => candidates;
  return manifest.createPullRequests();
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { 'recover-from': { type: 'string' }, 'release-as': { type: 'string' } },
  });
  const [mode] = positionals;
  if (
    positionals.length !== 1 ||
    Boolean(values['recover-from']) !== Boolean(values['release-as'])
  ) {
    throw new Error(
      'Use <pr|check> with both --recover-from <tag> and --release-as <version>, or neither',
    );
  }
  const recovery =
    values['recover-from'] && values['release-as']
      ? { from: values['recover-from'], releaseAs: values['release-as'] }
      : undefined;
  if (!['pr', 'check'].includes(mode ?? '')) {
    throw new Error('Usage: node scripts/release.ts <pr|check>');
  }
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!token || !repository) throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY are required');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Invalid GITHUB_REPOSITORY');
  const [owner, repo] = repository.split('/');
  const github = await GitHub.create({ owner, repo, token });
  // Maintain version PRs without automatic conversation messages.
  github.commentOnIssue = async () => '';
  const manifest = await Manifest.fromManifest(github, 'main');
  if (
    !(await prepareReleaseManifest(github, manifest, fixedReleaseApi(repository, token), recovery))
  ) {
    console.log('A merged release candidate remains pending; version PR maintenance is unchanged.');
    return;
  }
  setInitialRelease(manifest);
  if (mode === 'pr') await createFormattedPullRequests(manifest);
  else {
    const pullRequests = await manifest.buildPullRequests();
    const releases = await manifest.buildReleases();
    console.log(
      JSON.stringify(
        {
          pullRequests: pullRequests.map((pullRequest) => ({
            title: pullRequest.title.toString(),
            version: pullRequest.version?.toString(),
            notes: pullRequest.body.toString(),
          })),
          releases: releases.map((release) => ({
            title: release.name,
            version: release.tag.version.toString(),
            tag: release.tag.toString(),
            sha: release.sha,
            notes: release.notes,
          })),
        },
        null,
        2,
      ),
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Release command failed');
    process.exitCode = 1;
  });
}
