import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

export interface SmokeOptions {
  timeoutMs?: number;
  requestTimeoutMs?: number;
  retryDelayMs?: number;
}

/** A hosting check: GET only, with one deadline shared by all propagation retries. */
export async function smokeSite(baseUrl: string, options: SmokeOptions = {}): Promise<void> {
  const base = new URL(baseUrl);
  if (
    !['http:', 'https:'].includes(base.protocol) ||
    base.search ||
    base.hash ||
    base.username ||
    base.password
  ) {
    throw new Error(
      'Smoke URL must be an HTTP(S) site root without credentials, query or fragment',
    );
  }
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  const timeoutMs = options.timeoutMs ?? 120_000;
  const requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
  const retryDelayMs = options.retryDelayMs ?? 5_000;
  for (const value of [timeoutMs, requestTimeoutMs, retryDelayMs]) {
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new Error('Smoke timeouts must be positive integers');
  }
  const checks = [
    { path: '', kind: 'html' },
    { path: 'zh/', kind: 'html' },
    { path: 'search/', kind: 'html' },
    { path: 'pagefind/pagefind.js', kind: 'js' },
    { path: `__release-smoke-missing-${randomUUID()}/`, kind: 'missing' },
  ] as const;
  const deadline = performance.now() + timeoutMs;
  const observedFailures = new Set<string>();
  do {
    const results = await Promise.all(
      checks.map(async ({ path, kind }) => {
        const url = new URL(path, base);
        try {
          const remaining = Math.max(1, Math.ceil(deadline - performance.now()));
          const response = await fetch(url, {
            method: 'GET',
            redirect: 'manual',
            cache: 'no-store',
            signal: AbortSignal.timeout(Math.min(requestTimeoutMs, remaining)),
          });
          const body = await response.text();
          const expectedStatus = kind === 'missing' ? 404 : 200;
          if (response.status !== expectedStatus)
            throw new Error(`expected ${expectedStatus}, got ${response.status}`);
          if (kind === 'missing') return null;
          const contentType = response.headers
            .get('content-type')
            ?.split(';')[0]
            ?.trim()
            .toLowerCase();
          if (!body.trim()) throw new Error('empty response body');
          if (kind === 'html' && contentType !== 'text/html')
            throw new Error(`expected HTML, got ${contentType}`);
          if (
            kind === 'js' &&
            (!['text/javascript', 'application/javascript'].includes(contentType ?? '') ||
              /<(?:!doctype\s+html|html|head|body)\b/i.test(body))
          ) {
            throw new Error(`expected JavaScript without HTML fallback, got ${contentType}`);
          }
          return null;
        } catch (error) {
          return `${url.href}: ${error instanceof Error ? error.message : String(error)}`;
        }
      }),
    );
    const failures = results.filter((result): result is string => result !== null);
    if (!failures.length) return;
    for (const failure of failures) observedFailures.add(failure);
    const remaining = deadline - performance.now();
    if (remaining <= 0) break;
    await delay(Math.min(retryDelayMs, remaining));
  } while (performance.now() < deadline);
  throw new Error(
    `GET smoke failed for ${base.href} within ${timeoutMs}ms; observed failures:\n${[...observedFailures].join('\n')}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const url = process.argv[2];
  if (!url || process.argv.length !== 3) {
    console.error('Usage: node scripts/smoke-site.ts <site-url>');
    process.exitCode = 1;
  } else {
    smokeSite(url)
      .then(() => console.log(`GET smoke passed: ${url}`))
      .catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      });
  }
}
