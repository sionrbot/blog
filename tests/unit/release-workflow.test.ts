import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, test } from 'vite-plus/test';

const template = readFileSync(
  new URL('../../.github/workflows/release.yml', import.meta.url),
  'utf8',
);
const maintenance = readFileSync(
  new URL('../../.github/workflows/release-please.yml', import.meta.url),
  'utf8',
);
const jobs = [
  ...template.matchAll(/^  (prepare|pages|workers|refresh):\n([\s\S]*?)(?=^  \w+:|$(?![\s\S]))/gm),
].map((match) => ({
  id: match[1],
  body: match[2],
  steps: [
    ...match[2].matchAll(/^      - id: (\w+)\n([\s\S]*?)(?=^      - id: |$(?![\s\S]))/gm),
  ].map((step) => ({
    id: step[1],
    body: step[2],
    condition: step[2].match(/^        if: \$\{\{ (.*) \}\}$/m)?.[1],
  })),
}));
const steps = jobs.flatMap((job) => job.steps);

// Evaluate actual template conditions with the Actions default success() guard.
// External operations are controlled outcomes, not live deployment calls. This
// verifies job/step wiring; GitHub's native scheduler is separately documented.
function execute(failingStep?: string, superseded = false, kind = 'software') {
  const results: Record<string, { outcome: string; outputs: Record<string, string> }> = {};
  const attempted: string[] = [];
  const jobResults: Record<string, string> = {};
  for (const job of jobs) {
    const needs = job.body.match(/^    needs: (\w+)$/m)?.[1];
    if (needs && jobResults[needs] !== 'success') {
      jobResults[job.id] = 'skipped';
      continue;
    }
    if (job.id === 'refresh' && kind !== 'software') {
      jobResults[job.id] = 'skipped';
      continue;
    }
    let failed = false;
    for (const step of job.steps) {
      const condition = step.condition ?? 'success()';
      const explicitStatus = /(?:success|failure|cancelled|always)\(/.test(condition);
      const enabled =
        (!failed || explicitStatus) &&
        runInNewContext(condition, {
          steps: results,
          github: { event_name: kind === 'content' ? 'workflow_dispatch' : 'pull_request' },
          always: () => true,
          cancelled: () => false,
          failure: () => failed,
          success: () => !failed,
        });
      if (!enabled) {
        results[step.id] = { outcome: 'skipped', outputs: {} };
        continue;
      }
      attempted.push(step.id);
      const outcome = step.id === failingStep ? 'failure' : 'success';
      if (outcome === 'failure') failed = true;
      results[step.id] = {
        outcome,
        outputs:
          step.id === 'candidate'
            ? { kind }
            : step.id.endsWith('_latest')
              ? { deploy: String(!superseded) }
              : {},
      };
    }
    jobResults[job.id] = failed ? 'failure' : 'success';
  }
  return { attempted, failed: Object.values(jobResults).includes('failure'), results };
}

describe('fixed-source release wiring', () => {
  test('publishes only after checks, browser contracts and both independent builds', () => {
    const result = execute();
    expect(result.failed).toBe(false);
    const publishedAt = result.attempted.indexOf('publish');
    for (const prerequisite of [
      'candidate',
      'checks',
      'build_tests',
      'default_browser',
      'i18n_browser',
      'forms_browser',
      'rendering_browser',
      'production_path_browser',
      'pages_build',
      'workers_build',
    ]) {
      expect(result.attempted.indexOf(prerequisite), prerequisite).toBeGreaterThan(-1);
      expect(result.attempted.indexOf(prerequisite), prerequisite).toBeLessThan(publishedAt);
    }
    expect(result.attempted).toContain('pages_smoke');
    expect(result.attempted).toContain('workers_smoke');
  });

  test.each([
    'checks',
    'build_tests',
    'default_browser',
    'i18n_browser',
    'forms_browser',
    'rendering_browser',
    'production_path_browser',
    'pages_build',
    'workers_build',
    'pages_upload',
    'workers_upload',
  ])('%s failure prevents publication and deployment', (step) => {
    const result = execute(step);
    expect(result.failed).toBe(true);
    expect(result.attempted).not.toContain('publish');
    expect(result.attempted).not.toContain('pages_deploy');
    expect(result.attempted).not.toContain('workers_deploy');
  });

  test.each(['pages_latest', 'pages_deploy', 'pages_smoke'])(
    '%s failure still attempts Workers and keeps the run failed',
    (step) => {
      const result = execute(step);
      expect(result.failed).toBe(true);
      expect(result.attempted).toContain('workers_latest');
      expect(result.attempted).toContain('workers_deploy');
      expect(result.attempted).toContain('workers_smoke');
    },
  );

  test.each(['workers_deploy', 'workers_smoke'])(
    '%s failure preserves completed Pages smoke and fails the run',
    (step) => {
      const result = execute(step);
      expect(result.failed).toBe(true);
      expect(result.results.pages_smoke.outcome).toBe('success');
    },
  );

  test('superseded candidates skip both deployments', () => {
    const result = execute(undefined, true);
    expect(result.failed).toBe(false);
    expect(result.attempted).not.toContain('pages_deploy');
    expect(result.attempted).not.toContain('workers_deploy');
    expect(result.attempted).not.toContain('pages_smoke');
    expect(result.attempted).not.toContain('workers_smoke');
  });

  test('a retry repeats validation and both builds before using this run outputs', () => {
    execute('workers_smoke');
    const retry = execute();
    expect(retry.attempted.indexOf('workers_build')).toBeLessThan(
      retry.attempted.indexOf('publish'),
    );
    expect(steps.find((step) => step.id === 'pages_upload')?.body).toContain(
      'path: release-output/pages',
    );
    expect(steps.find((step) => step.id === 'pages_build')?.body).toContain(
      'cp -R dist release-output/pages',
    );
    expect(steps.find((step) => step.id === 'workers_deploy')?.body).toContain(
      'pnpm exec cf deploy --prebuilt',
    );
  });

  test.each(['pages', 'workers'])(
    '%s rejects deployment-only retries with stale outputs',
    (platform) => {
      const body = steps.find((step) => step.id === `${platform}_attempt`)!.body;
      const script = body
        .split('        run: |\n')[1]
        .split('\n')
        .map((line) => line.replace(/^          /, ''))
        .join('\n');
      const stale = spawnSync('sh', ['-e', '-c', script], {
        env: { ...process.env, PREPARED_ATTEMPT: '1', GITHUB_RUN_ATTEMPT: '2' },
        encoding: 'utf8',
      });
      expect(stale.status).toBe(1);
      expect(stale.stdout).toContain('Re-run all jobs');
      const current = spawnSync('sh', ['-e', '-c', script], {
        env: { ...process.env, PREPARED_ATTEMPT: '2', GITHUB_RUN_ATTEMPT: '2' },
      });
      expect(current.status).toBe(0);
    },
  );

  test('keeps all browser targets and scopes Pages permission away from verification', () => {
    const prepare = jobs.find((job) => job.id === 'prepare')!.body;
    for (const variant of ['default', 'i18n', 'configured-forms', 'rendering']) {
      expect(prepare).toContain(`--variant ${variant} --target desktop,narrow,webkit`);
    }
    expect(prepare).toContain('--variant production-path --target desktop');
    expect(prepare).not.toContain('pages: write');
    expect(prepare).not.toContain('id-token: write');
    expect(jobs.find((job) => job.id === 'pages')!.body).toContain('pages: write');
    expect(jobs.find((job) => job.id === 'refresh')!.body).toContain('group: release-pr-release');
    expect(jobs.find((job) => job.id === 'refresh')!.body).toContain('node scripts/release.ts pr');
  });

  test('content runs the same validation and both deployments without software publication', () => {
    const software = execute();
    const content = execute(undefined, false, 'content');
    expect(content.failed).toBe(false);
    expect(content.attempted).not.toContain('publish');
    for (const id of software.attempted.filter((id) => !['publish'].includes(id))) {
      expect(content.attempted).toContain(id);
    }
    expect(content.attempted).toContain('admission');
    expect(content.attempted).toContain('pages_smoke');
    expect(content.attempted).toContain('workers_smoke');
    expect(jobs.find((job) => job.id === 'refresh')!.body).toContain(
      "if: ${{ needs.prepare.outputs.kind == 'software' }}",
    );
  });

  test.each(['candidate', 'checks', 'workers_build', 'pages_upload'])(
    'content %s failure prevents both deployments and still records preparation',
    (step) => {
      const result = execute(step, false, 'content');
      expect(result.failed).toBe(true);
      expect(result.attempted).not.toContain('pages_deploy');
      expect(result.attempted).not.toContain('workers_deploy');
      expect(result.attempted).toContain('preparation_summary');
    },
  );

  test('admits only the release execution ref and live fixed input before running repository code', () => {
    const prepare = jobs.find((job) => job.id === 'prepare')!;
    expect(prepare.steps[0].id).toBe('admission');
    const admission = prepare.steps[0].body;
    expect(admission).toContain('refs/heads/release');
    expect(admission).toContain('^[a-f0-9]{40}$');
    expect(admission).toContain('"$CANDIDATE_SHA" != "$GITHUB_SHA"');
    expect(admission).toContain('/git/ref/heads/release');
    expect(admission).toContain('ref.object.sha !== process.env.CANDIDATE_SHA');
    expect(prepare.steps.find((step) => step.id === 'checkout')!.body).toContain('fetch-depth: 0');
  });

  test.each([
    ['refs/heads/main', 'a'.repeat(40), 'a'.repeat(40)],
    ['refs/heads/release', 'main', 'a'.repeat(40)],
    ['refs/heads/release', 'b'.repeat(40), 'a'.repeat(40)],
    ['refs/heads/release', 'a'.repeat(40) + '\n', 'a'.repeat(40)],
  ])('rejects invalid dispatch before network access: %s / %s', (ref, input, executionSha) => {
    const script = steps
      .find((step) => step.id === 'admission')!
      .body.split('        run: |\n')[1]
      .split("          node --input-type=module <<'NODE'")[0]
      .split('\n')
      .map((line) => line.replace(/^          /, ''))
      .join('\n');
    const result = spawnSync('bash', ['-e', '-c', script], {
      env: { ...process.env, GITHUB_REF: ref, CANDIDATE_SHA: input, GITHUB_SHA: executionSha },
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('Content deployment requires');
  });

  test('summary distinguishes a successful skipped job from an actual deployment and smoke failure', () => {
    const block = template.split('      - id: delivery_summary\n')[1];
    const script = block
      .split("          node --input-type=module <<'NODE'\n")[1]
      .split('          NODE')[0]
      .split('\n')
      .map((line) => line.replace(/^          /, ''))
      .join('\n')
      .replace("import { appendFileSync } from 'node:fs';", '');
    let output = '';
    runInNewContext(script, {
      process: {
        env: {
          JOB_RESULTS: JSON.stringify({
            prepare: {
              result: 'success',
              outputs: { version: '1.9.1', tag: 'v1.9.1', 'tag-sha': 'b'.repeat(40) },
            },
            pages: {
              result: 'success',
              outputs: { gate: 'false', deploy: 'skipped', smoke: 'skipped' },
            },
            workers: {
              result: 'failure',
              outputs: { gate: 'true', deploy: 'success', smoke: 'failure' },
            },
            refresh: { result: 'skipped' },
          }),
          CANDIDATE_KIND: 'content',
          CANDIDATE_SHA: 'a'.repeat(40),
          GITHUB_RUN_ID: '42',
          GITHUB_RUN_ATTEMPT: '2',
        },
      },
      appendFileSync: (_path: string, text: string) => {
        output += text;
      },
    });
    expect(output).toContain('Software publication: not applicable (content)');
    expect(output).toContain(
      '| pages | success | superseded; deployment skipped | skipped | skipped |',
    );
    expect(output).toContain('| workers | failure | eligible | success | failure |');
    expect(output).toContain('Run / attempt: 42 / 2');
  });

  test('both target gates receive the prepared tag SHA and summaries preserve separate results', () => {
    for (const target of ['pages', 'workers']) {
      expect(steps.find((step) => step.id === `${target}_latest`)!.body).toContain(
        'EXPECTED_TAG_SHA: ${{ needs.prepare.outputs.tag-sha }}',
      );
      expect(jobs.find((job) => job.id === target)!.body).toContain(
        `smoke: \${{ steps.${target}_smoke.outcome }}`,
      );
    }
    expect(template).toContain('needs: [prepare, pages, workers, refresh]');
    expect(template).toContain("output.gate === 'false' ? 'superseded; deployment skipped'");
    expect(template).toContain('not applicable (content)');
  });

  test('preserves the bounded native queue independently from PR maintenance', () => {
    expect(template).toContain(
      'group: release-production\n  queue: max\n  cancel-in-progress: false',
    );
    expect(maintenance).toContain('group: release-pr-release');
    expect(maintenance).toContain('node scripts/release.ts pr');
    expect(template).toContain('workflow_dispatch:');
    expect(maintenance).toContain('branches: [release]');
    expect(maintenance).toContain('ref: release');
    expect(template).not.toContain('continue-on-error:');
    expect(template).toContain(
      "ref: ${{ github.event_name == 'workflow_dispatch' && inputs.sha || github.event.pull_request.merge_commit_sha }}",
    );
  });
});
