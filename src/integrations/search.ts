import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import { close, createIndex } from 'pagefind';

/** Index each post once, independently of the language used by its surrounding UI. */
export function search(): AstroIntegration {
  let searchDirectory: URL;
  let searchPrefix: string;
  return {
    name: 'sionrbot-search',
    hooks: {
      'astro:config:done': ({ config }) => {
        searchDirectory = new URL('pagefind/', config.outDir);
        searchPrefix = `${config.base.replace(/\/$/, '')}/pagefind/`;
      },
      'astro:server:setup': ({ server }) => {
        // Development reuses the last production index, never indexing drafts.
        server.middlewares.use(async (request, response, next) => {
          const pathname = (request.url ?? '').split('?')[0];
          // Vite's base middleware can remove the deployment prefix first.
          const prefix = pathname.startsWith(searchPrefix) ? searchPrefix : '/pagefind/';
          if (!pathname.startsWith(prefix)) return next();
          const asset = pathname.slice(prefix.length);
          if (!/^(?:[\w-]+\/)*[\w-]+(?:\.[\w-]+)+$/.test(asset)) {
            response.statusCode = 404;
            return response.end();
          }
          try {
            const contents = await readFile(new URL(asset, searchDirectory));
            const types: Record<string, string> = {
              '.js': 'text/javascript',
              '.css': 'text/css',
              '.json': 'application/json',
            };
            response.setHeader('Content-Type', types[extname(asset)] ?? 'application/octet-stream');
            response.setHeader('Cache-Control', 'no-store');
            response.end(request.method === 'HEAD' ? undefined : contents);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
              response.statusCode = 404;
              response.end();
            } else next(error);
          }
        });
      },
      'astro:build:done': async ({ dir, logger }) => {
        try {
          // Chinese segmentation also preserves English words. A single index makes
          // every original searchable from either UI; English stemming is not used.
          const { index, errors } = await createIndex({
            rootSelector: '[data-search-post]',
            forceLanguage: 'zh',
          });
          if (errors.length || !index) throw new Error(errors.join('\n') || 'No search index');
          const indexed = await index.addDirectory({ path: fileURLToPath(dir) });
          if (indexed.errors.length) throw new Error(indexed.errors.join('\n'));
          const written = await index.writeFiles({
            outputPath: fileURLToPath(new URL('pagefind/', dir)),
          });
          if (written.errors.length) throw new Error(written.errors.join('\n'));
          logger.info('Generated the shared post search index');
        } finally {
          await close();
        }
      },
    },
  };
}
