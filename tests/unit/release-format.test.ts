import { afterEach, expect, it, vi } from 'vite-plus/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatReleaseFile } from '../../scripts/release-format';

const directories: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function noisyLauncher(exitCode?: number, corruptJson = false) {
  const realVp = fileURLToPath(new URL('bin/vp', import.meta.resolve('vite-plus/package.json')));
  const directory = mkdtempSync(join(tmpdir(), 'release-formatter-test-'));
  directories.push(directory);
  // Real child processes reproduce launcher stdout without touching dependencies.
  const script = `#!${process.execPath}
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
console.log('[WARN] launcher dependency diagnostic');
console.log('ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY');
const args = process.argv.slice(2);
if (args[0] === 'exec') args.splice(0, 2);
${corruptJson ? `writeFileSync(args.at(-1), '[WARN] corrupted JSON');\nprocess.exit(0);` : exitCode === undefined ? `const result = spawnSync(process.execPath, [${JSON.stringify(realVp)}, ...args], { stdio: 'inherit' });\nprocess.exit(result.status ?? 1);` : `process.exit(${exitCode});`}
`;
  const launcher = join(directory, 'launcher.mjs');
  writeFileSync(launcher, script);
  return launcher;
}

it('keeps successful launcher diagnostics out of JSON and Markdown updates', () => {
  const launcher = noisyLauncher();
  expect(formatReleaseFile('package.json', '{"name":"example","version":"1.8.4"}', launcher)).toBe(
    '{\n  "name": "example",\n  "version": "1.8.4"\n}\n',
  );
  expect(formatReleaseFile('.release-please-manifest.json', '{".":"1.8.4"}', launcher)).toBe(
    '{ ".": "1.8.4" }\n',
  );
  expect(formatReleaseFile('CHANGELOG.md', '# Changelog\n\n\n* repair release\n', launcher)).toBe(
    '# Changelog\n\n- repair release\n',
  );
});

it('rejects invalid JSON instead of returning an apparently successful update', () => {
  expect(() => formatReleaseFile('package.json', '{broken')).toThrow(/format release update/);
});

it('rejects invalid JSON output even when the formatter exits successfully', () => {
  const launcher = noisyLauncher(undefined, true);
  expect(() => formatReleaseFile('package.json', '{"version":"1.8.4"}', launcher)).toThrow(
    /format release update/,
  );
});

it('rejects a failed formatter even when it prints stdout', () => {
  const launcher = noisyLauncher(2);
  expect(() => formatReleaseFile('CHANGELOG.md', '# Changelog\n', launcher)).toThrow(
    /format release update/,
  );
});

it('leaves unsupported updates untouched', () => {
  const launcher = noisyLauncher(2);
  expect(formatReleaseFile('pnpm-lock.yaml', 'lockfileVersion: 9\n', launcher)).toBe(
    'lockfileVersion: 9\n',
  );
});

it('formats with the installed project tool when no global vp is on PATH', () => {
  vi.stubEnv('PATH', '/usr/bin:/bin');
  expect(formatReleaseFile('package.json', '{"version":"1.8.4"}')).toBe(
    '{\n  "version": "1.8.4"\n}\n',
  );
});
