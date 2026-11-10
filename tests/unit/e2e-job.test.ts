import { describe, expect, it } from 'vite-plus/test';
import { e2eJobFailures } from '../../scripts/verify-e2e-job';

const passed = {
  checkout: { outcome: 'success' },
  node: { outcome: 'success' },
  pnpm: { outcome: 'success' },
  dependencies: { outcome: 'success' },
  browsers: { outcome: 'success' },
  baseline_build: { outcome: 'success' },
  browser: { outcome: 'success' },
  browser_artifacts: { outcome: 'success' },
  agent: { outcome: 'success' },
  agent_artifacts: { outcome: 'success' },
};

describe('combined E2E job gate', () => {
  it.each(['default', 'rendering', 'configured-forms'])(
    'accepts complete %s coverage',
    (variant) => {
      const steps = {
        ...passed,
        baseline_build: { outcome: variant === 'default' ? 'success' : 'skipped' },
      };
      expect(e2eJobFailures(variant, steps, false)).toEqual([]);
    },
  );

  it('allows only the deliberate i18n AI skip', () => {
    const steps = {
      ...passed,
      baseline_build: { outcome: 'skipped' },
      agent: { outcome: 'skipped' },
      agent_artifacts: { outcome: 'skipped' },
    };
    expect(e2eJobFailures('i18n', steps, false)).toEqual([]);
    expect(e2eJobFailures('default', steps, false)).toHaveLength(3);
    expect(
      e2eJobFailures('i18n', { ...passed, baseline_build: { outcome: 'skipped' } }, false),
    ).toHaveLength(2);
  });

  it.each(Object.keys(passed))('rejects failure, cancellation, skip or omission of %s', (id) => {
    for (const outcome of ['failure', 'cancelled', 'skipped', undefined]) {
      expect(e2eJobFailures('default', { ...passed, [id]: { outcome } }, false)).toEqual([
        expect.stringContaining(id),
      ]);
    }
  });

  it('does not let a passing AI stage hide a browser failure', () => {
    expect(
      e2eJobFailures('default', { ...passed, browser: { outcome: 'failure' } }, false),
    ).toEqual(['browser: expected success, got failure']);
  });

  it('uses raw outcome rather than a continue-on-error success conclusion', () => {
    const browser = { outcome: 'failure', conclusion: 'success' };
    expect(e2eJobFailures('default', { ...passed, browser }, false)).toHaveLength(1);
  });

  it('rejects cancellation even after every stage succeeds', () => {
    expect(e2eJobFailures('default', passed, true)).toEqual(['Job cancelled']);
  });

  it('rejects an unknown variant instead of silently omitting AI', () => {
    expect(() => e2eJobFailures('unknown', passed, false)).toThrow('Unknown E2E variant');
  });
});

// A missing fixture-build skip must not hide a workflow wiring mistake.
it.each(['rendering', 'configured-forms', 'i18n'])(
  'rejects unexpected root build outcomes for %s',
  (variant) => {
    for (const outcome of ['success', 'failure', 'cancelled', undefined]) {
      expect(e2eJobFailures(variant, { ...passed, baseline_build: { outcome } }, false)).toContain(
        'baseline_build: expected skipped for fixture variant',
      );
    }
  },
);
