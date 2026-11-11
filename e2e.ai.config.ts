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
        'A reading-focused personal blog. Judge the visible rendering of tables, code and mathematics for legibility, contrast and overlap.',
      maxSteps: 12,
      maxModelCalls: 16,
    },
  },
} satisfies E2EConfig;
