import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { deepseek } from '@ai-sdk/deepseek';
import type { E2EConfig } from 'e2e';
import { e2eConfiguration } from './tests/support/e2e-targets.ts';

const localEnv = join(import.meta.dirname, '.env.e2e');
if (existsSync(localEnv)) process.loadEnvFile(localEnv);

export default {
  ...e2eConfiguration(),
  agents: {
    default: {
      model: deepseek(process.env.E2E_MODEL || 'deepseek-flash'),
      context:
        'A reading-focused personal blog. Use the visible site links and controls to navigate; do not navigate directly to guessed URLs. Form submissions are intercepted by the test.',
      maxSteps: 12,
      maxModelCalls: 16,
    },
  },
} satisfies E2EConfig;
