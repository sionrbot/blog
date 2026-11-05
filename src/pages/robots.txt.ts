import type { APIContext } from 'astro';
import { withBase } from '../utils/base-path';

export function GET({ site }: APIContext) {
  return new Response(
    `User-agent: *\nAllow: /\n\nSitemap: ${new URL(withBase('/sitemap-index.xml'), site)}\n`,
  );
}
