import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
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

export function formatReleaseFile(path: string, content: string): string {
  // The Node strategy updates JSON metadata and Markdown changelogs. Preserve
  // any other file format rather than guessing a parser or changing lockfiles.
  if (!/\.(?:json|md)$/.test(path)) return content;
  const result = spawnSync('pnpm', ['exec', 'vp', 'fmt', '--stdin-filepath', path], {
    input: content,
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`Could not format release update: ${path}`);
  }
  return result.stdout;
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
  const mode = process.argv[2];
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
