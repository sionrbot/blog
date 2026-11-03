import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';
import { e2eConfiguration } from './tests/support/e2e-targets.ts';

// Direct CLI/MCP usage needs no manifest. The suite runner supplies one for preview tests.
const url = new URL(process.env.APP_URL ?? 'http://127.0.0.1:0');
export default {
  ...(process.env.E2E_RUN_MANIFEST !== undefined
    ? e2eConfiguration()
    : {
        tests: 'tests/e2e/deterministic/default/**/*.e2e.ts',
        targets: [
          {
            name: 'desktop',
            engine: web(),
            app: {
              url: url.href,
              command: {
                executable: 'pnpm',
                args: ['run', 'dev', '--host', url.hostname, '--port', '{port}'],
                ...(url.port === '0' ? {} : { reuseExisting: true }),
                log: '.e2e/logs/dev.log',
              },
            },
          },
        ],
        workers: 1,
        retries: 0,
      }),
} satisfies E2EConfig;
