import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { openai } from '@ai-sdk/openai';
import type { E2EConfig } from 'e2e';
import { e2eConfiguration } from './tests/support/e2e-targets.ts';

const localEnv = join(import.meta.dirname, '.env.e2e');
if (existsSync(localEnv)) process.loadEnvFile(localEnv);

export default {
  ...e2eConfiguration(),
  agents: {
    default: {
      model: openai.responses(process.env.E2E_MODEL || 'gpt-6.1-sol'),
      providerOptions: { openai: { reasoningEffort: 'high' } },
      context:
        'A reading-focused personal blog. Use the visible site links and controls to navigate; do not navigate directly to guessed URLs. Form submissions are intercepted by the test.',
      maxSteps: 12,
      maxModelCalls: 16,
    },
  },
} satisfies E2EConfig;
