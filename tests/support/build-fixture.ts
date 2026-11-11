import { randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
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
  lang?: string;
  description?: string;
  body?: string;
}

interface FixtureOptions {
  posts?: readonly FixturePost[];
  siteUrl?: string;
}

export interface BuiltFixture {
  readonly dist: string;
  readonly reportDir: string;
  dispose(): Promise<void>;
}

/** Builds ordinary content once; callers only read the output and dispose it. */
export async function createBuiltFixture({
  name,
  posts,
  siteUrl,
}: {
  name: string;
  posts?: readonly FixturePost[];
  siteUrl?: string;
}): Promise<BuiltFixture> {
  const fixture = await createFixture(name, { posts, siteUrl });
  try {
    const result = await fixture.build();
    if (result.code !== 0) {
      throw new Error(
        `Fixture ${name} build exited ${result.code}; see ${fixture.reportDir}\n${result.stdout}\n${result.stderr}`,
      );
    }
    return {
      dist: fixture.dist,
      reportDir: fixture.reportDir,
      dispose: fixture.dispose.bind(fixture),
    };
  } catch (error) {
    try {
      await fixture.dispose();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        `Fixture ${name} build and cleanup failed; see ${fixture.reportDir}`,
      );
    }
    throw error;
  }
}

export interface BuildFixture {
  root: string;
  dist: string;
  reportDir: string;
  env: NodeJS.ProcessEnv;
  startProcess(args: string[], logName: string): ReturnType<typeof startAstro>;
  build(): Promise<ProcessResult>;
  beforeDispose(cleanup: () => Promise<void>): void;
  dispose(): Promise<void>;
}

/** Copies sources, never generated state or credentials. The caller owns disposal. */
export async function createFixture(
  name: string,
  options: FixtureOptions = {},
): Promise<BuildFixture> {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`Invalid fixture name: ${name}`);
  const root = await mkdtemp(join(tmpdir(), `sionrbot-${name}-`));
  const reportDir = join(
    projectRoot,
    'tests',
    'test-results',
    'build',
    runId,
    `${name}-${randomUUID()}`,
  );
  const env = fixtureEnv();
  if (options.siteUrl !== undefined) env.SITE_URL = options.siteUrl;
  let active: ReturnType<typeof startAstro> | undefined;
  let disposed = false;
  const processes = new Set<ReturnType<typeof startAstro>>();
  let disposal: Promise<void> | undefined;
  const cleanups: (() => Promise<void>)[] = [];
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
        const results = await Promise.allSettled(cleanups.map((cleanup) => cleanup()));
        results.push(...(await Promise.allSettled([...processes].map((child) => child.stop()))));
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
        await rm(root, { recursive: true, force: true });
      } finally {
        release();
      }
    })();
    return disposal;
  }
  const setup = (async () => {
    await mkdir(reportDir, { recursive: true });
    for (const entry of [
      'src',
      'public',
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
      for (const post of options.posts) {
        if (!/^[a-z0-9-]+$/.test(post.id)) throw new Error(`Invalid fixture post ID: ${post.id}`);
        const data = {
          title: post.title,
          description: post.description ?? `About ${post.id}`,
          pubDate: post.pubDate,
          tags: post.tags,
          draft: post.draft ?? false,
          ...(post.lang ? { lang: post.lang } : {}),
        };
        const frontmatter = Object.entries(data)
          .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
          .join('\n');
        await writeFile(
          join(content, `${post.id}.mdx`),
          `---\n${frontmatter}\n---\n\n${post.body ?? `Body of ${post.title}.`}\n`,
        );
      }
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
    beforeDispose(cleanup) {
      if (disposed) throw new Error('Fixture disposed');
      cleanups.push(cleanup);
    },
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
