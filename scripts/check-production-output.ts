import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { load } from 'cheerio';

/** Check the actual production output, rather than a separately rebuilt fixture. */
export async function checkProductionOutput(directory: string, siteUrl: string): Promise<void> {
  const site = new URL(siteUrl);
  if (!['http:', 'https:'].includes(site.protocol) || site.search || site.hash) {
    throw new Error('Expected an HTTP site URL without query or fragment');
  }
  if (!site.pathname.endsWith('/')) site.pathname += '/';
  const base = site.pathname;
  for (const prefix of ['', 'zh/']) {
    const route = `${prefix}search/`;
    const $ = load(await readFile(join(directory, route, 'index.html'), 'utf8'));
    const expectedCanonical = new URL('search/', site).href;
    if ($('link[rel="canonical"]').attr('href') !== expectedCanonical) {
      throw new Error(`${route}: canonical must be ${expectedCanonical}`);
    }
    const search = $('[data-search]');
    if (
      search.attr('data-bundle') !== `${base}pagefind/pagefind.js` ||
      search.attr('data-base') !== base ||
      search.attr('data-post-base') !== `${base}${prefix}articles/`
    ) {
      throw new Error(`${route}: search resources or article routes use the wrong deployment base`);
    }
  }
  const runtime = await readFile(join(directory, 'pagefind/pagefind.js'), 'utf8');
  if (!runtime.includes('pagefind_version') || /^\s*</.test(runtime)) {
    throw new Error('Missing Pagefind JavaScript runtime');
  }
  const entry: { languages?: Record<string, { hash?: unknown; page_count?: unknown }> } =
    JSON.parse(await readFile(join(directory, 'pagefind/pagefind-entry.json'), 'utf8'));
  if (!entry.languages || Object.keys(entry.languages).length === 0) {
    throw new Error('Missing Pagefind language indexes');
  }
  for (const [language, index] of Object.entries(entry.languages)) {
    if (
      typeof index.hash !== 'string' ||
      !/^[a-zA-Z0-9_-]+$/.test(index.hash) ||
      !Number.isInteger(index.page_count) ||
      Number(index.page_count) < 1
    ) {
      throw new Error(`Invalid Pagefind index metadata for ${language}`);
    }
    const metadata = await readFile(join(directory, `pagefind/pagefind.${index.hash}.pf_meta`));
    if (!metadata.length) throw new Error(`Empty Pagefind metadata for ${language}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , directory, siteUrl] = process.argv;
  if (!directory || !siteUrl)
    throw new Error('Usage: check-production-output.ts <directory> <site-url>');
  await checkProductionOutput(directory, siteUrl);
  console.log(`Verified production search output for ${siteUrl}`);
}
