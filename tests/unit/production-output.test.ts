import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vite-plus/test';
import { checkProductionOutput } from '../../scripts/check-production-output';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});
async function output(base: string) {
  const directory = await mkdtemp(join(tmpdir(), 'production-output-'));
  directories.push(directory);
  for (const prefix of ['', 'zh/']) {
    await mkdir(join(directory, prefix, 'search'), { recursive: true });
    await writeFile(
      join(directory, prefix, 'search/index.html'),
      `<link rel="canonical" href="https://fixture.example${base}search/">
      <div data-search data-bundle="${base}pagefind/pagefind.js" data-base="${base}" data-post-base="${base}${prefix}articles/"></div>`,
    );
  }
  await mkdir(join(directory, 'pagefind'));
  await writeFile(join(directory, 'pagefind/pagefind.js'), 'export const pagefind_version = "1";');
  await writeFile(
    join(directory, 'pagefind/pagefind-entry.json'),
    JSON.stringify({ languages: { en: { hash: 'en_abc123', page_count: 1 } } }),
  );
  await writeFile(join(directory, 'pagefind/pagefind.en_abc123.pf_meta'), 'index metadata');
  return directory;
}

test.each(['/', '/blog/'])('validates production search wiring at %s', async (base) => {
  await expect(
    checkProductionOutput(await output(base), `https://fixture.example${base}`),
  ).resolves.toBeUndefined();
});

test('rejects output built for the other target', async () => {
  await expect(
    checkProductionOutput(await output('/'), 'https://fixture.example/blog/'),
  ).rejects.toThrow('canonical');
});

test('rejects a root search resource under a correct subpath canonical', async () => {
  const directory = await output('/blog/');
  await writeFile(
    join(directory, 'search/index.html'),
    '<link rel="canonical" href="https://fixture.example/blog/search/"><div data-search data-bundle="/pagefind/pagefind.js" data-base="/blog/" data-post-base="/blog/articles/"></div>',
  );
  await expect(checkProductionOutput(directory, 'https://fixture.example/blog/')).rejects.toThrow(
    'deployment base',
  );
});

test('rejects HTML fallback masquerading as the search runtime', async () => {
  const directory = await output('/');
  await writeFile(join(directory, 'pagefind/pagefind.js'), '<html>pagefind_version</html>');
  await expect(checkProductionOutput(directory, 'https://fixture.example/')).rejects.toThrow(
    'JavaScript runtime',
  );
});

test('rejects an entry pointing to absent search metadata', async () => {
  const directory = await output('/');
  await rm(join(directory, 'pagefind/pagefind.en_abc123.pf_meta'));
  await expect(checkProductionOutput(directory, 'https://fixture.example/')).rejects.toThrow(
    'ENOENT',
  );
});
