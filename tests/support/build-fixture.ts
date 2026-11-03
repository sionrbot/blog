import { randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtureEnv, startAstro, withDeadline, type ProcessResult } from './astro-process.ts';

import { ownFixture } from './fixture-lifecycle.ts';

export const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const runId = `${new Date().toISOString().replaceAll(':', '-')}-${process.pid}`;

export interface FixturePost {
  id: string;
  title: string;
  pubDate: string;
  tags: string[];
  draft?: boolean;
}

interface FixtureOptions {
  posts?: readonly FixturePost[];
  demo?: boolean;
  mutation?: 'publish-drafts' | 'break-pagination' | 'external-next' | 'external-prev';
  invalidDescription?: boolean;
}

export interface BuildFixture {
  root: string;
  dist: string;
  reportDir: string;
  env: NodeJS.ProcessEnv;
  startProcess(args: string[], logName: string): ReturnType<typeof startAstro>;
  build(): Promise<ProcessResult>;
  dispose(): Promise<void>;
}

async function replaceOnce(path: string, before: string, after: string) {
  const source = await readFile(path, 'utf8');
  if (source.split(before).length !== 2) throw new Error(`Expected exactly one anchor in ${path}`);
  await writeFile(path, source.replace(before, after));
}

/** Copies sources, never generated state or credentials. The caller owns disposal. */
export async function createFixture(
  name: string,
  options: FixtureOptions = {},
): Promise<BuildFixture> {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`Invalid fixture name: ${name}`);
  const root = await mkdtemp(join(tmpdir(), `sionrbot-${name}-`));
  const reportDir = join(projectRoot, 'test-results', 'build', runId, `${name}-${randomUUID()}`);
  const env = fixtureEnv(options.demo ?? false);
  let active: ReturnType<typeof startAstro> | undefined;
  let disposed = false;
  const processes = new Set<ReturnType<typeof startAstro>>();
  let disposal: Promise<void> | undefined;
  const release = ownFixture(dispose);
  function startProcess(args: string[], logName: string) {
    if (disposed) throw new Error('Fixture disposed');
    const child = startAstro(root, args, env, join(reportDir, logName));
    processes.add(child);
    void child.result.finally(() => processes.delete(child)).catch(() => {});
    return child;
  }
  function dispose(): Promise<void> {
    disposed = true;
    disposal ??= (async () => {
      await setup.catch(() => {});
      try {
        const results = await Promise.allSettled([...processes].map((child) => child.stop()));
        for (const file of ['resolved-config.json', 'resolved-vite.json']) {
          try {
            await cp(join(root, file), join(reportDir, file));
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          }
        }
        const failures = results.filter((result) => result.status === 'rejected');
        if (failures.length)
          throw new AggregateError(
            failures.map((result) => result.reason),
            'Fixture subprocess cleanup failed',
          );
      } finally {
        try {
          await rm(root, { recursive: true, force: true });
        } finally {
          release();
        }
      }
    })();
    return disposal;
  }
  const setup = (async () => {
    await mkdir(reportDir, { recursive: true });
    for (const entry of [
      'src',
      'public',
      'CHANGELOG.md',
      'astro.config.mjs',
      'tsconfig.json',
      'package.json',
      'pnpm-workspace.yaml',
    ]) {
      await cp(join(projectRoot, entry), join(root, entry), { recursive: true });
    }
    await symlink(join(projectRoot, 'node_modules'), join(root, 'node_modules'), 'dir');
    if (options.posts) {
      const content = join(root, 'src/content/blog');
      await rm(content, { recursive: true });
      await mkdir(content, { recursive: true });
      for (const [index, post] of options.posts.entries()) {
        if (!/^[a-z0-9-]+$/.test(post.id)) throw new Error(`Invalid fixture post ID: ${post.id}`);
        const data = {
          title: post.title,
          description:
            options.invalidDescription && index === 0 ? 'x'.repeat(161) : `About ${post.id}`,
          pubDate: post.pubDate,
          tags: post.tags,
          draft: post.draft ?? false,
        };
        const frontmatter = Object.entries(data)
          .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
          .join('\n');
        await writeFile(
          join(content, `${post.id}.mdx`),
          `---\n${frontmatter}\n---\n\nBody of ${post.title}.\n`,
        );
      }
    }
    if (options.mutation === 'publish-drafts') {
      await replaceOnce(
        join(root, 'src/utils/posts.ts'),
        'import.meta.env.DEV || !post.data.draft',
        'true /* deliberate test mutation */',
      );
    }
    if (options.mutation === 'break-pagination') {
      await replaceOnce(
        join(root, 'src/components/blog/Pagination.astro'),
        'href={url.next}',
        'href="/blog/999/"',
      );
    }
    if (options.mutation === 'external-next' || options.mutation === 'external-prev') {
      const direction = options.mutation === 'external-next' ? 'next' : 'prev';
      await replaceOnce(
        join(root, 'src/components/blog/Pagination.astro'),
        `href={url.${direction}}`,
        'href={`https://wrong.example${url.' + direction + '}`}',
      );
    }
    // Preserve the actual app config and integrations; override only test isolation paths.
    await writeFile(
      join(root, 'fixture.config.mjs'),
      `import config from './astro.config.mjs';
import { writeFileSync } from 'node:fs';
export default {
  ...config,
  cacheDir: './.cache/astro',
  vite: {
    ...config.vite,
    cacheDir: './.cache/vite',
    plugins: [...config.vite.plugins, {
      name: 'test-vite-cache-audit',
      configResolved(resolved) {
        writeFileSync(new URL('./resolved-vite.json', import.meta.url), JSON.stringify({
          root: resolved.root,
          cacheDir: resolved.cacheDir,
        }, null, 2));
      },
    }],
  },
  integrations: [...config.integrations, {
    name: 'test-cache-audit',
    hooks: {
      'astro:config:done': ({ config }) => {
        writeFileSync(new URL('./resolved-config.json', import.meta.url), JSON.stringify({
          root: config.root.href,
          outDir: config.outDir.href,
          cacheDir: config.cacheDir.href,
          viteCacheDir: config.vite.cacheDir,
        }, null, 2));
      },
    },
  }],
};
`,
    );
    await writeFile(
      join(reportDir, 'manifest.json'),
      JSON.stringify(
        { name, root, dist: join(root, 'dist'), options, node: process.version },
        null,
        2,
      ),
    );
  })();
  try {
    await setup;
    if (disposed) throw new Error('Fixture interrupted during setup');
  } catch (error) {
    await dispose();
    throw error;
  }

  return {
    root,
    dist: join(root, 'dist'),
    reportDir,
    env,
    startProcess,
    async build() {
      if (disposed || active) throw new Error('Fixture disposed or already building');
      active = startProcess(['build'], 'build.log');
      try {
        const result = await withDeadline(active.result, 120_000, `Build; see ${reportDir}`);
        await writeFile(join(reportDir, 'result.json'), JSON.stringify(result, null, 2));
        return result;
      } finally {
        const process = active;
        active = undefined;
        await process.stop();
      }
    },
    dispose,
  };
}
