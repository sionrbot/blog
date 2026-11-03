import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const cli = join(dirname(require.resolve('vite-plus/package.json')), 'bin/vp');
for (const timezone of ['UTC', 'America/Los_Angeles', 'Asia/Singapore']) {
  console.log(
    `Date unit test: TZ=${timezone}, Node=${process.version}, ICU=${process.versions.icu}`,
  );
  const result = spawnSync(
    process.execPath,
    [cli, 'test', '--project', 'unit', 'tests/unit/dates.test.ts'],
    {
      env: { ...process.env, TZ: timezone },
      stdio: 'inherit',
      timeout: 60_000,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
