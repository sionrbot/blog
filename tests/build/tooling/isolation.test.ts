import { createHash, randomUUID } from 'node:crypto';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vite-plus/test';
import {
  createBuiltFixture,
  createFixture,
  projectRoot,
  type BuildFixture,
} from '../../support/build-fixture';
import { listPostPaths, readHtml } from '../../support/parse-output';

async function fingerprint(path: string): Promise<string> {
  const hash = createHash('sha256');
  const files = (await readdir(path, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
  for (const file of files) {
    hash.update(file);
    hash.update(await readFile(file));
  }
  return hash.digest('hex');
}

async function cachePaths(fixture: BuildFixture) {
  const data: unknown = JSON.parse(
    await readFile(join(fixture.root, 'resolved-config.json'), 'utf8'),
  );
  if (!data || typeof data !== 'object') throw new Error('Missing resolved Astro configuration');
  const config = data as Record<string, unknown>;
  for (const key of ['root', 'outDir', 'cacheDir', 'viteCacheDir']) {
    expect(typeof config[key], key).toBe('string');
  }
  const root = await realpath(fixture.root);
  expect(fileURLToPath(String(config.root))).toBe(`${root}/`);
  expect(fileURLToPath(String(config.outDir))).toBe(`${root}/dist/`);
  const astro = fileURLToPath(String(config.cacheDir));
  const vite = resolve(root, String(config.viteCacheDir));
  expect(astro).toBe(`${root}/.cache/astro/`);
  expect(vite).toBe(join(root, '.cache/vite'));
  const resolvedVite: unknown = JSON.parse(
    await readFile(join(root, 'resolved-vite.json'), 'utf8'),
  );
  expect(resolvedVite).toEqual({ root, cacheDir: vite });
  expect((await stat(astro)).isDirectory()).toBe(true);
  expect(await realpath(join(root, 'node_modules'))).toBe(
    await realpath(join(projectRoot, 'node_modules')),
  );
  return { astro, vite };
}

test('A0: independent builds retain distinct content and caches without changing source or root dist', async () => {
  const sourceBefore = await fingerprint(join(projectRoot, 'src'));
  const distBefore = await fingerprint(join(projectRoot, 'dist'));
  const first = await createFixture('isolation-first', {
    posts: [{ id: 'first-only', title: 'First only', pubDate: '2026-01-01', tags: ['first'] }],
  });
  let second: BuildFixture | undefined;
  try {
    const firstResult = await first.build();
    expect(firstResult.code, firstResult.stderr).toBe(0);
    const firstCaches = await cachePaths(first);
    second = await createFixture('isolation-second', {
      posts: [{ id: 'second-only', title: 'Second only', pubDate: '2026-02-01', tags: ['second'] }],
    });
    const secondResult = await second.build();
    expect(secondResult.code, secondResult.stderr).toBe(0);
    const secondCaches = await cachePaths(second);
    expect(firstCaches.astro).not.toBe(secondCaches.astro);
    expect(firstCaches.vite).not.toBe(secondCaches.vite);
    expect(listPostPaths((await readHtml(first.dist, '/articles/')).html())).toEqual([
      '/articles/first-only/',
    ]);
    expect(listPostPaths((await readHtml(second.dist, '/articles/')).html())).toEqual([
      '/articles/second-only/',
    ]);
    expect(await fingerprint(join(projectRoot, 'src'))).toBe(sourceBefore);
    expect(await fingerprint(join(projectRoot, 'dist'))).toBe(distBefore);
  } finally {
    try {
      await second?.dispose();
    } finally {
      await first.dispose();
    }
  }
  await expect(stat(first.root)).rejects.toMatchObject({ code: 'ENOENT' });
  if (second) await expect(stat(second.root)).rejects.toMatchObject({ code: 'ENOENT' });
  expect((await readFile(join(first.reportDir, 'build.log'), 'utf8')).length).toBeGreaterThan(0);
});

test('failed ordinary builds remove their temporary root and retain actionable diagnostics', async () => {
  const name = `failed-build-${randomUUID()}`;
  let failure: unknown;
  try {
    const fixture = await createBuiltFixture({
      name,
      posts: [
        {
          id: 'diagnostic-control',
          title: 'Diagnostic control',
          pubDate: 'not-a-date',
          tags: [],
        },
      ],
    });
    // If the helper unexpectedly succeeds, still release its temporary directory.
    await fixture.dispose();
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Error);
  const reports = join(projectRoot, 'tests/test-results/build');
  const manifests = (await readdir(reports, { recursive: true })).filter(
    (path) => path.includes(`${name}-`) && path.endsWith('/manifest.json'),
  );
  expect(manifests).toHaveLength(1);
  const reportDir = join(reports, manifests[0]!, '..');
  expect(String(failure)).toContain(reportDir);
  expect(String(failure)).toContain('diagnostic-control');
  expect(String(failure)).toContain('pubDate');
  const manifest = JSON.parse(await readFile(join(reportDir, 'manifest.json'), 'utf8'));
  expect(manifest.name).toBe(name);
  await expect(stat(manifest.root)).rejects.toMatchObject({ code: 'ENOENT' });
  const result = JSON.parse(await readFile(join(reportDir, 'result.json'), 'utf8'));
  expect(result.code).not.toBe(0);
  expect(result.code).not.toBeNull();
  expect(await readFile(join(reportDir, 'build.log'), 'utf8')).toContain('pubDate');
});
