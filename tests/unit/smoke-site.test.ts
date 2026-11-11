import { createServer, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { smokeSite } from '../../scripts/smoke-site.ts';

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(async (server) => {
      server.closeAllConnections();
      server.close();
      await once(server, 'close');
    }),
  );
});

async function serve(handler: (path: string, response: ServerResponse, method: string) => void) {
  const server = createServer((request, response) =>
    handler(request.url ?? '', response, request.method ?? ''),
  );
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP server');
  return `http://127.0.0.1:${address.port}`;
}

function healthy(path: string, response: ServerResponse) {
  if (path.includes('__release-smoke-missing-')) {
    response.writeHead(404, { 'Content-Type': 'text/html' }).end('<html>Not found</html>');
  } else if (path.endsWith('.js')) {
    response
      .writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' })
      .end('export const search = () => [];');
  } else {
    response
      .writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      .end('<!doctype html><html>Blog</html>');
  }
}

const quick = { timeoutMs: 120, requestTimeoutMs: 40, retryDelayMs: 10 };
// Successful requests need scheduling headroom when the full suite runs in parallel.
const successful = { timeoutMs: 2_000, requestTimeoutMs: 2_000, retryDelayMs: 10 };

describe('deployment GET smoke', () => {
  it.each(['/', '/blog/'])(
    'checks pages, search JS and a missing path under %s using only GET',
    async (base) => {
      const requests: string[] = [];
      const url = await serve((path, response, method) => {
        expect(method).toBe('GET');
        requests.push(path);
        healthy(path, response);
      });
      await smokeSite(`${url}${base}`, successful);
      const missing = requests.filter((path) => path.includes('__release-smoke-missing-'));
      expect(requests.filter((path) => !path.includes('__release-smoke-missing-')).sort()).toEqual(
        [base, `${base}zh/`, `${base}pagefind/pagefind.js`].sort(),
      );
      expect(requests).toHaveLength(4);
      expect(missing).toEqual([
        expect.stringMatching(new RegExp(`^${base}__release-smoke-missing-`)),
      ]);
    },
  );

  it('retries propagation failures and succeeds within the shared deadline', async () => {
    let attempts = 0;
    const url = await serve((path, response) => {
      if (path === '/' && ++attempts === 1) response.writeHead(503).end('not ready');
      else healthy(path, response);
    });
    await smokeSite(url, successful);
    expect(attempts).toBe(2);
  });

  it.each([
    ['HTML content type', 'text/html', '<!doctype html><html>fallback</html>'],
    ['HTML body mislabeled as JS', 'application/javascript', '<html>fallback</html>'],
    ['empty JS', 'text/javascript', ''],
  ])('rejects %s for the search runtime', async (_name, contentType, body) => {
    const url = await serve((path, response) => {
      if (path.endsWith('.js')) response.writeHead(200, { 'Content-Type': contentType }).end(body);
      else healthy(path, response);
    });
    await expect(smokeSite(url, quick)).rejects.toThrow('pagefind/pagefind.js');
  });

  it.each([200, 302])('rejects a missing route returning %s', async (status) => {
    const url = await serve((path, response) => {
      if (path.includes('__release-smoke-missing-'))
        response.writeHead(status, { Location: '/' }).end('fallback');
      else healthy(path, response);
    });
    await expect(smokeSite(url, quick)).rejects.toThrow(`expected 404, got ${status}`);
  });

  it('bounds stalled response bodies and all retries by one deadline', async () => {
    let requests = 0;
    const url = await serve((_path, response) => {
      requests++;
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.write('<html>');
    });
    const started = performance.now();
    await expect(smokeSite(url, quick)).rejects.toThrow('GET smoke failed');
    expect(performance.now() - started).toBeLessThan(1000);
    expect(requests).toBeGreaterThan(5);
  });

  it('rejects a failed key page even when other resources work', async () => {
    const url = await serve((path, response) => {
      if (path === '/zh/') response.writeHead(500).end('broken');
      else healthy(path, response);
    });
    await expect(smokeSite(url, quick)).rejects.toThrow('/zh/: expected 200, got 500');
  });
});
