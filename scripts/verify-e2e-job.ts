import { pathToFileURL } from 'node:url';

interface StepResult {
  outcome?: string;
}

/** A skipped required stage must not turn a partially executed job green. */
export function e2eJobFailures(
  variant: string,
  steps: Record<string, StepResult>,
  cancelled: boolean,
): string[] {
  if (!['default', 'rendering', 'configured-forms', 'i18n'].includes(variant)) {
    throw new Error(`Unknown E2E variant: ${variant}`);
  }
  const required = [
    'checkout',
    'node',
    'pnpm',
    'dependencies',
    'browsers',
    'browser_build',
    'browser',
    'browser_artifacts',
  ];
  const agent = ['agent_build', 'agent', 'agent_artifacts'];
  if (variant !== 'i18n') required.push(...agent);
  const failures = cancelled ? ['Job cancelled'] : [];
  for (const id of required) {
    if (steps[id]?.outcome !== 'success') {
      failures.push(`${id}: expected success, got ${steps[id]?.outcome ?? 'missing'}`);
    }
  }
  if (variant === 'i18n') {
    for (const id of agent) {
      if (steps[id]?.outcome !== 'skipped') {
        failures.push(`${id}: expected skipped for i18n, got ${steps[id]?.outcome ?? 'missing'}`);
      }
    }
  }
  return failures;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const failures = e2eJobFailures(
    process.env.E2E_VARIANT ?? '',
    JSON.parse(process.env.E2E_STEPS ?? '{}') as Record<string, StepResult>,
    process.env.E2E_CANCELLED !== 'false',
  );
  for (const failure of failures) console.error(failure);
  process.exitCode = failures.length ? 1 : 0;
}
