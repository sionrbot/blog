import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { extractReleaseArchive, prepareDeployment } from '../../scripts/deploy-release';
import { sha256 } from '../../scripts/release-evidence';
import type { ReleaseRecord } from '../../scripts/release-artifacts';

const directories: string[] = [];
async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'deployment-test-'));
  directories.push(directory);
  return directory;
}
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

function archive(path: string, name = 'nested/index.html', kind = 'file') {
  execFileSync('python3', [
    '-c',
    `
import io, sys, tarfile
path, name, kind = sys.argv[1:]
with tarfile.open(path, 'w') as output:
    first = tarfile.TarInfo('first.txt')
    first.size = 5
    output.addfile(first, io.BytesIO(b'first'))
    member = tarfile.TarInfo(name)
    if kind == 'file':
        member.size = 5
        output.addfile(member, io.BytesIO(b'hello'))
    else:
        member.type = {'symlink': tarfile.SYMTYPE, 'hardlink': tarfile.LNKTYPE, 'fifo': tarfile.FIFOTYPE, 'device': tarfile.CHRTYPE}[kind]
        member.linkname = 'first.txt'
        output.addfile(member)
`,
    path,
    name,
    kind,
  ]);
}

describe('release archive extraction', () => {
  it('restores regular files and implicit directories without a build', async () => {
    const directory = await temporaryDirectory();
    const source = join(directory, 'release.tar');
    const destination = join(directory, 'dist');
    archive(source);
    extractReleaseArchive(source, destination);
    expect(await readFile(join(destination, 'first.txt'), 'utf8')).toBe('first');
    expect(await readFile(join(destination, 'nested/index.html'), 'utf8')).toBe('hello');
  });

  it.each([
    ['../escape.txt', 'file'],
    ['nested/../../escape.txt', 'file'],
    ['/absolute.txt', 'file'],
    ['link', 'symlink'],
    ['link', 'hardlink'],
    ['pipe', 'fifo'],
    ['device', 'device'],
  ])('rejects %s (%s) before writing even an earlier safe member', async (name, kind) => {
    const directory = await temporaryDirectory();
    const source = join(directory, 'release.tar');
    const destination = join(directory, 'dist');
    archive(source, name, kind);
    expect(() => extractReleaseArchive(source, destination)).toThrow();
    expect(await readdir(directory)).toEqual(['release.tar']);
  });

  it('rejects an existing destination symlink that would escape the root', async () => {
    const directory = await temporaryDirectory();
    const destination = await temporaryDirectory();
    const outside = await temporaryDirectory();
    const source = join(directory, 'release.tar');
    await symlink(outside, join(destination, 'nested'));
    archive(source);
    expect(() => extractReleaseArchive(source, destination)).toThrow();
    expect(await readdir(destination)).toEqual(['nested']);
    expect(await readdir(outside)).toEqual([]);
  });
});

const sha = 'a'.repeat(40);
const tree = 'b'.repeat(40);
const repository = 'sionrbot/blog';
const tag = 'v1.8.0';
function releaseResponses({ latest = tag, brokenAsset = false } = {}) {
  const pages = Buffer.from('pages package');
  const workers = Buffer.from('workers package');
  const evidence = {
    schema: 1 as const,
    repository,
    pullRequest: 42,
    headSha: 'c'.repeat(40),
    testedSha: 'd'.repeat(40),
    tree,
    runId: 1,
    runAttempt: 1,
    version: '1.8.0',
  };
  const record: ReleaseRecord = {
    schema: 1,
    repository,
    tag,
    sha,
    bundle: {
      ...evidence,
      kind: 'bundle',
      files: { 'pages.tar': sha256(pages), 'workers.tar': sha256(workers) },
    },
    e2e: { ...evidence, kind: 'e2e', files: {} },
  };
  const manifest = Buffer.from(JSON.stringify(record));
  const bodies = [manifest, pages, workers];
  const names = ['release-manifest.json', 'pages.tar', 'workers.tar'];
  return vi.fn<typeof fetch>(async (input) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const path = url.pathname.replace(`/repos/${repository}/`, '');
    if (path === 'releases/latest') return Response.json({ tag_name: latest });
    if (path === `releases/tags/${tag}`)
      return Response.json({ id: 9, tag_name: tag, draft: false, prerelease: false });
    if (path === 'releases/9/assets')
      return Response.json(
        names.map((name, index) => ({
          id: index + 1,
          name,
          state: 'uploaded',
          digest: `sha256:${sha256(bodies[index])}`,
        })),
      );
    if (path === `commits/${tag}`) return Response.json({ sha, commit: { tree: { sha: tree } } });
    const match = /^releases\/assets\/(\d)$/.exec(path);
    if (match) {
      const index = Number(match[1]) - 1;
      if (brokenAsset && index === 2) return new Response('unavailable', { status: 503 });
      return new Response(new Uint8Array(bodies[index]));
    }
    throw new Error(`Unexpected request: ${url}`);
  });
}

async function deploymentEnvironment() {
  const directory = await temporaryDirectory();
  const output = join(directory, 'github-output');
  await writeFile(output, 'existing=value\n');
  vi.stubEnv('GITHUB_REPOSITORY', repository);
  vi.stubEnv('GITHUB_TOKEN', 'test-token');
  vi.stubEnv('GITHUB_OUTPUT', output);
  return { directory: join(directory, 'assets'), output };
}

describe('release deployment preparation', () => {
  it('downloads verified assets and emits the exact release SHA', async () => {
    const { directory, output } = await deploymentEnvironment();
    vi.stubGlobal('fetch', releaseResponses());
    await prepareDeployment(tag, directory);
    expect(await readFile(output, 'utf8')).toBe(`existing=value\nsha=${sha}\n`);
    expect(await readdir(directory)).toEqual(['pages.tar', 'release-manifest.json', 'workers.tar']);
    expect(await readFile(join(directory, 'pages.tar'), 'utf8')).toBe('pages package');
  });

  it('rejects superseded tags before downloading any assets or emitting a SHA', async () => {
    const { directory, output } = await deploymentEnvironment();
    const fetcher = releaseResponses({ latest: 'v1.9.0' });
    vi.stubGlobal('fetch', fetcher);
    await expect(prepareDeployment(tag, directory)).rejects.toThrow('latest published stable');
    expect(fetcher).toHaveBeenCalledOnce();
    expect(await readFile(output, 'utf8')).toBe('existing=value\n');
  });

  it('does not emit a deployment SHA after a partial asset download failure', async () => {
    const { directory, output } = await deploymentEnvironment();
    vi.stubGlobal('fetch', releaseResponses({ brokenAsset: true }));
    await expect(prepareDeployment(tag, directory)).rejects.toThrow('503');
    expect(await readFile(output, 'utf8')).toBe('existing=value\n');
    await expect(readFile(join(directory, 'release-manifest.json'))).rejects.toThrow();
  });
});
