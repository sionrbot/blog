# Testing

This repository includes unit/build tests and TesterArmy E2E tests.
Core implementation and remote quality, deterministic E2E and AI acceptance
are complete; the verified revisions and reports are recorded below. E2E focuses
on key user flows, necessary deterministic assertions, a few AI visual checks,
and production preview regression. It uses the official default config for
local development and Codex MCP. SEO/JSON-LD, content schema and Markdown
rendering are checked by build artifact tests. The proposed English/Simplified Chinese
UI switch is specified in [i18n implementation spec](i18n-spec.md); it is not implemented yet.

The source of truth is `package.json`, the runner configurations, `tests/`, and
`.github/workflows/`. The `build` runner project includes build artifact tests
and integration tests; not every case only inspects static output.

## Run locally

Use the Node and pnpm versions pinned in `package.json` and
`pnpm-workspace.yaml`. On a fresh checkout, generate Astro's content types
before running the other checks:

```sh
vp install
vp run check
vp check
vp run lint
pnpm run i18n:check
pnpm run test:unit
pnpm run test:unit:tz
vp run build
pnpm run test:build
```

`vp run build` runs Astro. The built-in `vp build` does not.

`test:build` reuses the project's existing `dist` for the default-route checks.
Run `vp run build` after any application or content change and before this
suite. Missing output is an error; an old `dist` cannot establish the behavior
of a changed working tree. The isolation test also requires the root `dist` to
exist because it fingerprints that directory before and after fixture builds.
CI always builds the current checkout first.

For a focused run:

```sh
vp test --project unit tests/unit/posts.test.ts
vp test --project build tests/build/publication.test.ts
vp test --project build tests/build/pagination.test.ts
vp test --project build tests/build/isolation.test.ts
vp test --project build tests/build/interruption.test.ts
vp test --project build tests/build/routes.test.ts
vp test --project build tests/build/seo.test.ts tests/build/schema.test.ts tests/build/rendering.test.ts
```

`test:unit:tz` starts separate processes for UTC, America/Los_Angeles and
Asia/Singapore. Each checks the actual date formatter output against the same
handwritten expectations, including UTC year boundaries. It prints the Node
and ICU versions to make failures reproducible.

## i18n

Run `pnpm run i18n:check` for the strict x18n check and `pnpm run test:unit`
for dictionary and runtime contracts. x18n does not replace runtime tests.

- [Implementation spec](i18n-spec.md): confirmed requirements, proposed UI switching behavior, content-language separation and implementation scope.
- [Tests and current evidence](i18n-testing.md): existing coverage, known scanner/placeholder limits, and the planned static/unit/build/browser test matrix.
- [Agent workflow](i18n-testing.md#agent-workflow): official skills, MCP, CLI commands and setup requirements.

The current en/ko/hu checks are the pre-migration baseline. The target en/zh-Hans
UI switch and its new tests remain unimplemented; the case inventory below
counts only existing tests.

## What is covered

| Layer               | Files                              | Contract                                                                                                                                                                                          |
| ------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| unit test           | `tests/unit/posts.test.ts`         | Tag normalization, tag/post links, and refusal to load collections through the unit stub                                                                                                          |
| unit test           | `tests/unit/dates.test.ts`         | UTC dates, year boundaries, leap day and requested locale                                                                                                                                         |
| unit test           | `tests/unit/i18n.test.ts`          | Dictionary keys, placeholders, nonempty translations and locale fallback; [i18n details](i18n-testing.md)                                                                                         |
| build artifact test | `tests/build/isolation.test.ts`    | Two isolated builds retain their own content and caches; source and root dist remain unchanged; invalid description fails and its corrected control succeeds                                      |
| build artifact test | `tests/build/publication.test.ts`  | PUB-01/PUB-02: drafts are absent from details, home, lists, tags, RSS and sitemap; published content is ordered; the home page contains the newest six posts                                      |
| integration test    | `tests/build/publication.test.ts`  | PUB-03: the same fixture exposes its draft through actual Astro dev HTTP responses                                                                                                                |
| build artifact test | `tests/build/pagination.test.ts`   | PAGE-01/PAGE-02: 1/10/11/20/21 posts, exact ordered pages, adjacent links, titles, canonical URLs and no empty extra page                                                                         |
| integration test    | `tests/build/interruption.test.ts` | Independent processes receive SIGTERM after build or SIGINT with dev running; temporary directories disappear, diagnostics survive, exit status is 143/130, and the dev endpoint stops responding |
| build artifact test | `tests/build/routes.test.ts`       | ROUTE-01/ROUTE-02: default routes and linked articles/tags exist; demo includes the changelog; production omits the dev-only styleguide                                                           |

The publication and pagination suites also build deliberate mutations in
isolated copies: one disables draft filtering, one breaks a next-page
path, and two replace previous/next links with external URLs that keep the correct
path. Adjacent-link assertions check both origin and pathname. They require the
build and parsing to succeed, then require the same contract assertion to reject that output. A crashed build does not count as a
successful sensitivity check. `sensitivity.json` records which assertion
rejected each mutation.

The source data and expected manifests in `tests/fixtures` do not call the
production sorting, pagination or slug functions. The 20-post case protects
against an extra empty page at an exact multiple of the page size; the 21-post
case protects the newly needed third page. Empty-blog behavior remains a
separate product decision. The interruption probe uses an empty content fixture
to reduce setup cost; it does not establish an empty-blog product contract.

The additional build contracts reuse the existing fixture and parsers; no new
runner, dependency or AI scenario is needed:

- `seo.test.ts` checks default and overridden origins across canonical, OG,
  JSON-LD, RSS, sitemap and robots. Article cases cover publication/update dates,
  fallback versus hero images, breadcrumbs and escaped `<`/`</script>` titles.
  The default-origin case expects a normal `vp run build` without `SITE_URL`;
  the isolated fixture sets its own override explicitly.
- `schema.test.ts` checks invalid dates and missing hero alt text with corrected
  builds, plus actual parsed defaults (`tags=[]`, `draft=false`) and publication.
  The existing description-length negative/control case stays in `isolation.test.ts`.
- `rendering.test.ts` builds `.md` and `.mdx` together once. It verifies inline,
  display and chemical math, recoverable formula errors, conditional KaTeX CSS,
  native wrapped tables and labeled task checkboxes.

Current case inventory (parameterized cases counted individually):

| Runner project | File                               | Cases |
| -------------- | ---------------------------------- | ----: |
| unit           | `tests/unit/posts.test.ts`         |     8 |
| unit           | `tests/unit/dates.test.ts`         |     5 |
| unit           | `tests/unit/i18n.test.ts`          |     8 |
| build          | `tests/build/isolation.test.ts`    |     2 |
| build          | `tests/build/publication.test.ts`  |     4 |
| build          | `tests/build/pagination.test.ts`   |     8 |
| build          | `tests/build/routes.test.ts`       |     2 |
| build          | `tests/build/interruption.test.ts` |     2 |
| build          | `tests/build/seo.test.ts`          |     5 |
| build          | `tests/build/schema.test.ts`       |     3 |
| build          | `tests/build/rendering.test.ts`    |     6 |

There are 21 unit cases and 32 build-project cases. The timezone command reruns
only the five date cases in each of three independent processes; these are
15 additional executions, not 15 new contracts. Case counts are a maintenance
snapshot, not a coverage percentage.

## Isolation and lifecycle

The build helper copies `src`, `public`, `CHANGELOG.md`, and the necessary
Astro/TypeScript/package/workspace configuration into an OS temporary directory.
It never copies `.env` files or the existing generated state. It links the
installed `node_modules`, so running the suite requires no additional install.

A fixture-only config imports the real Astro config and preserves its
integrations. It overrides Astro `cacheDir` and Vite `cacheDir` to independent
paths under the copy, and records both Astro's and Vite's resolved paths.
`.astro` and `dist` also belong to the copy. The A0 isolation test verifies these
paths and the actual content from two consecutive builds. The production
configuration is not edited.

- The build project runs files serially with one worker and no concurrent cases.
- Each build has a 120-second process deadline. Test and hook deadlines are 180 seconds.
- The dev helper requests an OS-assigned port, waits for a successful HTTP response,
  and fails after 60 seconds if readiness is not reached.
- On POSIX, the process helper sends SIGTERM to the Astro child process group it
  created, then SIGKILL after
  five seconds if needed. Waiting after SIGKILL and writing process diagnostics each
  have a further five-second deadline. Test cleanup stops the dev server before removing its copy.
- Each caller releases its fixture in `finally` or `afterAll`, including failed builds.
  Disposal is idempotent and also owns any active dev server.
- A shared lifecycle owner keeps SIGINT/SIGTERM handlers registered throughout setup,
  build, assertions and disposal. Interruption waits for setup, stops owned subprocesses,
  archives available diagnostics, removes safely stopped fixtures, and exits with status
  130/143. The overall interruption deadline is 30 seconds; cleanup failures are printed.
  Failed cleanup retains the fixture and reports the error; it never deletes
  files while termination is unconfirmed. Killing the owner itself before cleanup
  completes cannot guarantee cleanup.
- `interruption.test.ts` signals independent Node processes after a real build and with
  an active dev server. It checks directory removal, retained diagnostics, nonzero exit
  status and that the dev server no longer accepts connections. The probe reports
  its fixture path before build, and its failure cleanup tries SIGTERM with a
  35-second wait before falling back to SIGKILL.
  These two regression cases do not exhaustively inject signals during setup,
  active build, simultaneous fixture disposal or forced termination.
- Child processes receive an explicit environment; production URL and demo flags
  from the shell cannot leak into fixture builds. Fixture URLs use
  `https://fixture.example`.

The `astro:content` alias exists only in the unit project. Its `getCollection`
stub throws immediately. Real Astro subprocesses never load that alias; their
collection/filtering behavior must be verified through actual output. PNG
imports needed by `src/config.ts` use Vite's unit transformation; image metadata
and rendering are not mocked into publishing tests.

## Reports and failure diagnosis

Each fixture writes a unique directory below:

```text
test-results/build/<run-id>/<fixture-name>-<uuid>/
  manifest.json
  build.log
  result.json
  resolved-config.json
  resolved-vite.json
  dev.log                 # when a dev server was used
  sensitivity.json        # for mutation cases
```

Reports survive temporary-directory cleanup. `manifest.json` includes inputs,
root/dist paths and Node version; `result.json` contains the exit code, stdout,
stderr and measured duration. Some early failures cannot produce all files.
The temporary root in a completed report normally no longer exists: reproduce
with the named focused test instead of trying to open that directory.

Start with the test assertion and its fixture's `build.log`. A nonzero build
exit is only expected for the deliberately invalid description case, whose
error must name the fixture and field; the corrected fixture must build.
Schema diagnostics are not compared to an entire version-sensitive message.

The `quality` CI job runs unit test and the timezone matrix before build, then
build artifact test before the existing Lighthouse and internal-link checks.
Failed jobs upload `test-results/build/` as `build-test-diagnostics`, alongside
the existing Lighthouse diagnostics. Reports are ignored by Git and by the
format/lint tools; test source remains subject to all normal checks.

## A0/A verification and limits

Baseline source commit: `5481c4e`. The implementation adds test infrastructure;
it does not change the application's content, routes, component APIs or theme.
The installed parser versions are Cheerio 1.2.0 and fast-xml-parser 5.11.2;
the existing Vite+ 1.4.0 supplies Vitest 5.0.5.

A0 verified the unit alias and PNG import, isolated builds with linked
node_modules, cache resolution, a field-specific failure and positive control,
and the dev-server lifecycle.

Fact — local validation after the Spec P2 fixes on 2026-11-03:

| Command                 | Observed result                                                 |
| ----------------------- | --------------------------------------------------------------- |
| `vp run check`          | Passed; 0 errors, warnings or hints                             |
| `vp check`              | Passed formatting, lint and type checks                         |
| `vp run lint`           | Passed Oxlint and ESLint                                        |
| `vp run build`          | Passed                                                          |
| `pnpm run test:unit`    | 3 files, 21 passed                                              |
| `pnpm run test:unit:tz` | 5 passed in each of UTC, America/Los_Angeles and Asia/Singapore |
| `pnpm run test:build`   | 5 files, 17 passed                                              |

These results describe the local working tree at validation time, not a committed
or remotely executed release. The runtime reported Node 26.13.0 and ICU 78.3;
`package.json` pins pnpm 11.28.10. Fixture logs and configuration evidence remain
under `test-results/build/`; elapsed times are not CI performance guarantees.

The Spec P2 fixes have regression evidence:

- External previous/next URLs with correct paths were accepted by the original
  pagination assertion. Both added mutation cases failed before the origin check
  and passed after it; all eight pagination cases passed.
- SIGTERM after build left the temporary directory behind before lifecycle
  ownership moved from the CLI to the fixture. The independent-process regression
  reproduced that failure. After the fix, both the post-build SIGTERM and active-dev
  SIGINT cases passed, including retained diagnostics and nonzero exit status.

Not covered by A0/A: browser interactions, theme-state synchronization,
configured-form submission, full SEO/schema/rendering matrices, cross-browser
layout, HTTP behavior of the deployment platform, or visual regression test.
The parsers inspect RSS/sitemap structure and expected content; they are not a
complete XML conformance audit. Existing Lighthouse checks cover only their
configured default pages. No result here claims E2E test or full accessibility
coverage. Remote CI execution still needs a pushed change; local success is
not evidence that GitHub Actions has run.

## TesterArmy E2E installation and credentials

The official `pnpm dlx e2e init --yes` initializer bootstrapped the skill,
example and test configuration. The project uses Codex only, with its E2E MCP
registration in `.codex/config.toml`. Installed versions are `e2e@0.22.0`,
`@e2e-dev/web@0.15.4`, `ai@7.0.159`, `@ai-sdk/deepseek@3.0.77`, and
`zod@4.6.7`. The example passed against the existing dev server before moving
into the default deterministic suite. The project-local skill is
`.agents/skills/e2e/SKILL.md`; its upstream content is excluded from formatting.

```sh
pnpm install --frozen-lockfile
pnpm exec e2e-web install chromium webkit
# Linux CI adds --with-deps to install system libraries.
```

Agent steps use the direct DeepSeek provider. `.env.e2e` is a local, ignored
file with permissions 0600; never commit its contents. Set:

```dotenv
DEEPSEEK_API_KEY=your-key
E2E_MODEL=deepseek-flash
```

The user selected DeepSeek V4.1 Flash. DeepSeek's current official API name is
`deepseek-flash`, serving V4.1-Flash-1017, rather than the display name
`deepseek-v4.1-flash`. See the [official model table](https://api-docs.deepseek.com/quick_start/pricing/).
`E2E_MODEL` can override the model ID. `e2e.ai.config.ts` loads `.env.e2e`
explicitly; existing environment variables take precedence. Deterministic
configuration never loads credentials. API-key authentication needs no
`e2e login`. CI reads its separate `DEEPSEEK_API_KEY` secret.

## Running E2E tests

Build current sources first. Default tests reuse root `dist`; they do not
silently rebuild it. Each non-default variant builds one isolated copy.

```sh
vp run build
pnpm run test:e2e
pnpm run test:e2e -- --variant rendering
pnpm run test:e2e -- --variant configured-forms
# Chromium desktop + 360px + WebKit 360px:
pnpm run test:e2e -- --target desktop,narrow,webkit
pnpm run test:e2e -- --variant rendering --target desktop,narrow,webkit
pnpm run test:e2e -- --variant configured-forms --target desktop,narrow,webkit

# Requires the local API key or CI secret; these spend model calls:
pnpm run test:e2e:ai -- --target desktop
pnpm run test:e2e:ai -- --variant rendering
pnpm run test:e2e:ai -- --variant configured-forms
```

The orchestrator consumes one optional leading `--`, plus `--variant` and
`--list`. It forwards supported test file/line, target, grep/tag, repeat,
budget, timeout, retry, headed, debug and cache flags. Unknown arguments fail.
Default targets are `desktop` (Chromium 1280×800) and `narrow` (Chromium 360×800);
`webkit` is explicitly selectable. All use one worker and zero retries.

```sh
pnpm run test:e2e -- --list
pnpm run test:e2e -- tests/e2e/deterministic/default/theme.e2e.ts --target desktop
pnpm run test:e2e:ai -- tests/e2e/ai/default/reading.e2e.ts --target desktop --no-cache
pnpm run test:e2e:ai -- tests/e2e/ai/default/reading.e2e.ts --target desktop --repeat-each 5 --retries 0
```

Direct `npx e2e mcp`, `npx e2e list` and `npx e2e run` use the default
development target without a manifest. Production regression must use the
orchestrator scripts above: they prepare and validate `E2E_RUN_MANIFEST`.
A supplied but invalid manifest fails rather than falling back to dev.
Production selection is exactly
`tests/e2e/<mode>/<variant>/**/*.e2e.ts`; variants are never multiplied into
browser targets. Empty selection returns nonzero, as do startup failures.

## E2E contracts

| Variant          | Deterministic cases | AI cases | Contract                                                                                                                                                                                                             |
| ---------------- | ------------------: | -------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| default          |                  14 |        3 | Official example; reading navigation and active links; HTTP 404/noindex/no canonical; manual/system/storage-error theme behavior; keyboard skip link and visible focus; five default routes at 360px; disabled forms |
| rendering        |                   1 |        1 | Wide native table, code and KaTeX scroll within their own containers; document fits the viewport; embedded section controls remain usable; AI reads the specimen                                                     |
| configured-forms |                   3 |        3 | Required/email validity; contact POST fields; newsletter default and custom field/hidden values; intercepted popup POST; exactly one submission                                                                      |

Every AI navigation goal is followed by exact URL/heading assertions. Form
field values, method and payload remain deterministic assertions. A newsletter
opens a new window, so an AI submit goal can click twice while seeing an
unchanged source page. The test caught that error with its exact request count;
AI now fills the email and the test submits once deterministically. It does not
weaken the count or invent a success toast.

Form variants use fake credentials and local test actions. `browser.route`
intercepts contact and popup newsletter requests before navigation; successful
runs verified interception without contacting a real submission service.
Fixture-only pages and content never enter real `src/` or root `dist`.

Contact requirements are checked one field at a time while every other field
has a valid value. `tests/support/e2e-forms.ts` shares interception, expected
payloads and exact constraints between deterministic and AI suites; their
actions remain explicit in each test.

AI rendering judges screenshots (`vision: 'only'`) at four actual content
positions: table, code block, equation and embedded newsletter. Exact viewport
bounds, document width, disabled state and input-value checks remain. This is a
small readability check, not complete visual-regression coverage. The suite
does not include tests that deliberately damage the page to test its assertions.

The H1 regression first failed: after system light→dark, `html.dark` changed
but `aria-pressed` stayed false. The authorized fix makes `ThemeToggle` observe
root class changes and synchronize its buttons. The unchanged regression now
passes on all three browser targets. On macOS WebKit, keyboard tests use
Option-Tab to traverse links, matching Safari's keyboard behavior; they still
require actual keyboard focus and activation.

## Preview ownership, reports and MCP

`tests/support/run-e2e.ts` prepares the selected variant and manifest, runs the
E2E CLI, then disposes the fixture. Production targets declare Astro preview
through the official `app.command` configuration. TesterArmy starts preview,
waits for readiness and stops it when the run ends; the project does not
implement a second process supervisor. The wrapper selects one available port
for all browser targets to share the same preview; Astro permits one preview
per project root. `app.identity` remains stable per variant for replay across
changing ports. Collection-only `--list` starts no preview. Run one
invocation per root at a time.

Report paths remain under the real project:

```text
.e2e/runs/<unique-run-id>/<mode>/<variant>/
  manifest.json
  preview.log
  runner.log
  result.json              # final invocation status, including cleanup errors
  report.json              # TesterArmy test outcomes
  junit.xml
  results/.../trace.md
  orchestrator.log          # preparation/runner/cleanup errors
```

On ordinary SIGINT/SIGTERM interruption, the wrapper forwards termination to
the E2E CLI and waits for it before disposing the fixture. Normal completion
and test failure use the same disposal path. Cleanup errors make the invocation
fail. This is routine test cleanup; the suite does not inject arbitrary process
faults or promise cleanup after the orchestrator itself is forcibly killed.

Every invocation gets a unique directory: a startup failure cannot be mistaken
for an earlier passing report. Traces are retained even for passed tests to
inspect agent calls and replay decisions. `.e2e/` is ignored by Git and tools.
Do not infer replay merely from speed or the provider's prompt-token cache:
inspect the action replay fields/model-call counts. Model pricing is not
available in all reports; tokens are not a measured dollar cost.

The project registers the E2E MCP server only in `.codex/config.toml`:

```toml
[mcp_servers.e2e]
command = "npx"
args = ["e2e", "mcp"]
```

The project-local E2E skill remains in `.agents/skills/e2e/SKILL.md`.
No separate MCP test configuration is needed. Without `E2E_RUN_MANIFEST`,
`e2e.config.ts` supplies one desktop dev
target. Its default `http://127.0.0.1:0` allocates an available port; set
`APP_URL` to a fixed local URL to reuse an existing dev server. It starts
`pnpm run dev` when needed and
logs to `.e2e/logs/dev.log`. Start a new Codex session after changing the MCP
registration. With a manifest, the same config retains the production preview,
variant-specific test selection, three browser targets and isolated reports.
`e2e.ai.config.ts` continues to require the production orchestrator manifest.

## E2E CI and coverage limits

`.github/workflows/e2e.yml` runs the three deterministic variants independently
on PRs and main pushes, with Chromium desktop/narrow and WebKit narrow. Its AI
job runs only when manually dispatched on main with `run_ai=true` and the
DeepSeek secret configured. A non-AI event does not claim AI tests passed.
Artifacts include hidden `.e2e/runs/` and fixture build diagnostics; the existing
quality workflow is preserved. No PR comments, deployment or branch protection
changes are made. Remote quality and deterministic E2E results are recorded in the closing status below.

These tests verify desktop browser engines at fixed viewport sizes, not real
mobile devices. Preview 404 behavior does not establish hosting-platform 404
configuration. Keyboard, semantic and layout checks are not a complete
accessibility audit; configured forms and pagination remain outside the
existing Lighthouse page set. Screenshot baseline regression remains optional
and is not implemented. SEO/schema/content-rendering assertions run in the build suite described above.
Normalized-tag route integration checks case/whitespace aliases, exact article order,
no duplicate articles and draft exclusion in the existing publication build.
The proposed bilingual UI switch is not covered by the existing E2E variants;
see the [i18n test design](i18n-testing.md#test-design).

## Verifying E2E changes

Run the affected variant against a fresh production build and inspect its
`report.json` and failure trace. Use `--no-cache` when a changed AI flow needs
live verification; routine reruns can use the replay cache. Check the report's
model-call and replay fields rather than inferring replay from speed.

Older reports under `.e2e/runs/` remain local historical evidence. Their case
counts describe the suite at that time, not the current inventory above.
Remote CI results must be checked separately from local runs.

## Closing status (2026-11-04)

- Implemented: publication/pagination, normalized-tag routes, SEO/JSON-LD,
  schema, Markdown/MDX rendering, three E2E variants and the Codex MCP entry.
- The earlier localized-build plan is superseded by the [bilingual UI spec](i18n-spec.md).
  That feature and its new tests remain unimplemented. Pixel baselines, comprehensive
  accessibility audits and AI required checks remain optional follow-up work.
- Removed from scope: E2E mutation proofs and arbitrary process-fault injection.
- Verified commit `75d0e3c`: [quality CI](https://github.com/sionrbot/sionrbot-blog/actions/runs/41676759051)
  passed all checks, unit 21/21, timezone 5/5 in each zone, build 32/32,
  Lighthouse (three URLs, nine runs) and internal links (33 scanned).
- [Deterministic E2E](https://github.com/sionrbot/sionrbot-blog/actions/runs/41676759125)
  passed all three variant jobs; report artifacts were uploaded for each variant.
- [PR #8](https://github.com/sionrbot/sionrbot-blog/pull/8) was merged into main as
  `2034bd4` with user approval. Branch protection was not changed.
- One [manual AI acceptance run](https://github.com/sionrbot/sionrbot-blog/actions/runs/41678389076)
  on that clean main revision passed all three AI variants: default 6/6,
  configured-forms 6/6 and rendering 2/2 (Chromium desktop and narrow).
  All 14 results have one attempt, zero failed/interrupted/flaky/skipped results,
  and actual model usage: 353,045 + 94,067 + 75,930 = 523,042 tokens.
  Provider prompt-token caching is not action replay or a measured dollar cost.
  The same workflow also passed all three deterministic browser jobs and uploaded
  the six variant report artifacts.
- `DEEPSEEK_API_KEY` is configured as a repository Actions secret. AI stays
  manual-only on main; this acceptance sample does not establish long-term
  stability or make AI a required PR check.
