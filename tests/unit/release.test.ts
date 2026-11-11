import { expect, it, vi } from 'vite-plus/test';
import { DefaultChangelogNotes } from 'release-please/build/src/changelog-notes/default.js';
import { Changelog } from 'release-please/build/src/updaters/changelog.js';
import { PackageJson } from 'release-please/build/src/updaters/node/package-json.js';
import { Version } from 'release-please/build/src/version.js';
import { createFormattedPullRequests, setInitialRelease } from '../../scripts/release';

const sha = 'a'.repeat(40);

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
