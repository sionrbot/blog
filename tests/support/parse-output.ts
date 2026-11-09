import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { load } from 'cheerio';
import { XMLParser } from 'fast-xml-parser';

/** Map a URL path to decoded file names; Astro does not nest dist under base. */
export function outputPath(pathname: string, base = '/'): string {
  const prefix = base.replace(/\/$/, '');
  if (!prefix) return decodeURIComponent(pathname);
  if (pathname === prefix) return '/';
  if (!pathname.startsWith(`${prefix}/`)) {
    throw new Error(`Path ${pathname} is outside deployment base ${base}`);
  }
  return decodeURIComponent(pathname.slice(prefix.length));
}

/** Read an actual emitted document, never a component or a mocked collection. */
export async function readHtml(dist: string, route: string) {
  const file = route.endsWith('.html') ? route : `${route.replace(/\/$/, '')}/index.html`;
  return load(await readFile(join(dist, file), 'utf8'));
}

export function listPostPaths(html: string) {
  const $ = load(html);
  return $('main ol > li h2 a, main ol > li h3 a')
    .map((_, element) => $(element).attr('href'))
    .get();
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected an XML element object');
  }
  return value as Record<string, unknown>;
}

function entries(value: unknown): unknown[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function string(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected XML text');
  return value;
}

function parseXml(source: string): Record<string, unknown> {
  const parsed: unknown = new XMLParser({ parseTagValue: false }).parse(source);
  return record(parsed);
}

export function rssPosts(source: string) {
  const channel = record(record(parseXml(source).rss).channel);
  return entries(channel.item).map((item) => {
    const post = record(item);
    return {
      url: string(post.link),
      title: string(post.title),
      pubDate: string(post.pubDate),
    };
  });
}

/** Follow the emitted sitemap index instead of assuming one hardcoded shard. */
export async function sitemapUrls(dist: string, base = '/'): Promise<string[]> {
  const index = parseXml(await readFile(join(dist, 'sitemap-index.xml'), 'utf8'));
  const shards = entries(record(index.sitemapindex).sitemap);
  const urls: string[] = [];
  for (const shard of shards) {
    const pathname = new URL(string(record(shard).loc)).pathname;
    if (pathname.includes('..')) throw new Error('Unexpected sitemap shard path');
    const document = parseXml(await readFile(join(dist, outputPath(pathname, base)), 'utf8'));
    for (const entry of entries(record(document.urlset).url)) {
      urls.push(string(record(entry).loc));
    }
  }
  return urls;
}
