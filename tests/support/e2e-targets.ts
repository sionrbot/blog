import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { web } from '@e2e-dev/web';
import type { E2EConfig } from 'e2e';
import { projectRoot } from './build-fixture.ts';

export interface E2EManifest {
  mode: 'deterministic' | 'ai';
  variant: 'default' | 'rendering' | 'configured-forms' | 'i18n' | 'production-path';
  siteUrl: string;
  sourceSha: string;
  sourceDirty: boolean;
  root: string;
  port: number;
  dist: string;
  testsGlob: string;
  reportDir: string;
}

export function e2eConfiguration(): E2EConfig {
  const path = process.env.E2E_RUN_MANIFEST;
  if (!path || !isAbsolute(path)) {
    throw new Error('Use pnpm run test:e2e (or test:e2e:ai) to prepare E2E_RUN_MANIFEST.');
  }
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as E2EManifest;
  const { mode, variant, root, dist, reportDir, testsGlob, port, siteUrl, sourceSha, sourceDirty } =
    manifest;
  if (
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535 ||
    !['deterministic', 'ai'].includes(mode) ||
    !['default', 'rendering', 'configured-forms', 'i18n', 'production-path'].includes(variant) ||
    (mode === 'ai' && variant !== 'rendering') ||
    typeof siteUrl !== 'string' ||
    !/^https?:\/\//.test(siteUrl) ||
    !/^[0-9a-f]{40}$/.test(sourceSha) ||
    typeof sourceDirty !== 'boolean' ||
    !isAbsolute(root) ||
    dist !== join(root, 'dist') ||
    !isAbsolute(reportDir) ||
    !resolve(reportDir).startsWith(join(projectRoot, '.e2e', 'runs') + '/') ||
    testsGlob !== `tests/e2e/${mode}/${variant}/**/*.e2e.ts`
  )
    throw new Error('Invalid E2E manifest');
  const deployment = new URL(siteUrl);
  if (variant === 'production-path' && deployment.href !== 'https://fixture.example/blog/')
    throw new Error('production-path requires the production fixture deployment URL');
  const require = createRequire(import.meta.url);
  const astroCli = join(dirname(require.resolve('astro/package.json')), 'bin/astro.mjs');
  const app = {
    url: `http://127.0.0.1:${port}${deployment.pathname}`,
    command: {
      executable: process.execPath,
      args: [
        astroCli,
        'preview',
        '--host',
        '127.0.0.1',
        '--port',
        '{port}',
        ...(variant === 'default' ? [] : ['--config', 'fixture.config.mjs']),
      ],
      cwd: root,
      env: { ASTRO_TELEMETRY_DISABLED: '1', SITE_URL: siteUrl },
      log: relative(projectRoot, join(reportDir, 'preview.log')),
    },
    identity: `sionrbot-e2e:${variant}`,
    environment: 'test' as const,
  };
  return {
    tests: testsGlob,
    targets: [
      {
        name: 'desktop',
        engine: web({
          viewport: { width: 1280, height: 800 },
          colorScheme: 'light',
          ...(variant === 'i18n' ? { locale: 'zh-CN' } : {}),
        }),
        app,
      },
      {
        name: 'narrow',
        engine: web({ viewport: { width: 360, height: 800 }, colorScheme: 'light' }),
        app,
      },
      {
        name: 'webkit',
        engine: web({
          browser: 'webkit',
          viewport: { width: 360, height: 800 },
          colorScheme: 'light',
        }),
        app,
      },
    ].filter((target) => variant !== 'production-path' || target.name === 'desktop'),
    // Deterministic tests own a browser context; AI checks stay serial.
    workers: mode === 'deterministic' ? 2 : 1,
    retries: 0,
    timeout: 120_000,
    actionTimeout: 10_000,
    reporters: ['list', 'junit'],
    output: relative(projectRoot, reportDir),
    trace: 'on',
  };
}
