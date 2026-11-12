import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, test } from 'vite-plus/test';

const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
const steps = workflow
  .split(/^      - /m)
  .slice(1)
  .map((body) => ({
    body,
    condition: body.match(/^        if: \$\{\{ (.*) \}\}$/m)?.[1],
  }));

function execute(scope: string | undefined, failCommand?: string) {
  let failed = false;
  const commands: string[] = [];
  for (const step of steps) {
    const condition = step.condition ?? 'true';
    const enabled =
      (!failed || condition.includes('always()')) &&
      runInNewContext(condition, {
        steps: { scope: { outputs: { scope } } },
        always: () => true,
      });
    if (!enabled) continue;
    const command = step.body.match(/^        run: (.+)$/m)?.[1];
    if (!command) continue;
    commands.push(command);
    if (command === failCommand) failed = true;
  }
  return { commands, failed };
}

test('documentation verification runs formatting and omits production checks', () => {
  const { commands } = execute('docs');
  expect(commands).toContain('pnpm install --frozen-lockfile');
  expect(commands).toContain('pnpm exec vp fmt --check');
  expect(commands).not.toContain('pnpm run check');
  expect(commands).not.toContain('pnpm run build');
  expect(commands.some((command) => command.includes('test:'))).toBe(false);
});

test.each(['full', undefined, 'unexpected'])('scope %s retains full verification', (scope) => {
  const { commands } = execute(scope);
  expect(commands).toContain('pnpm run check');
  expect(commands).toContain('pnpm exec vp check');
  expect(commands).toContain('pnpm run build');
  expect(commands).toContain('pnpm run test:e2e -- --variant production-path --target desktop');
  expect(commands).not.toContain('pnpm exec vp fmt --check');
});

test.each([
  ['docs', 'pnpm exec vp fmt --check'],
  ['full', 'pnpm run check'],
  ['full', 'pnpm install --frozen-lockfile'],
])('a failed %s check cannot be converted to a successful job', (scope, command) => {
  const result = execute(scope, command);
  expect(result.failed).toBe(true);
  expect(result.commands.at(-1)).toBe(command);
});

test('required job remains unconditional and checkout includes merge parents', () => {
  expect(workflow).not.toMatch(/^\s+paths(?:-ignore)?:/m);
  expect(workflow).toContain('  pull_request:');
  expect(workflow).toContain('  workflow_dispatch:');
  expect(workflow.split('    steps:')[0]).not.toMatch(/^    if:/m);
  expect(workflow).toContain('fetch-depth: 2');
});
