# Testing

Test source, testing guides and generated fixture reports live in `tests/`. Commands and runner settings are defined in `package.json`,
`vite.config.ts`, `e2e.config.ts`, `e2e.ai.config.ts` and `.github/workflows/`.
See [I18N.md](I18N.md) for language contracts and translation tooling.

## What to test

| Layer                 | Source                                                                    | Contracts                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit                  | `tests/unit/`                                                             | Post/tag links and normalization; UTC dates and locale formatting; dictionaries, interpolation, locale fallback and localized page identities       |
| Build and integration | `tests/build/publication.test.ts`, `pagination.test.ts`, `routes.test.ts` | Draft exclusion across public surfaces, dev draft visibility, publication order, normalized tags, exact pagination and route availability           |
| Build                 | `tests/build/seo.test.ts`, `schema.test.ts`                               | Canonical/OG/JSON-LD/RSS/sitemap/robots consistency; escaped titles; dates, content language, description length, hero alt text and schema defaults |
| Build                 | `tests/build/rendering.test.ts`, `page-math.test.ts`                      | Markdown/MDX math, recoverable formula errors, conditional KaTeX styles, tables, checkboxes and shared-page layouts                                 |
| Build                 | `tests/build/i18n.test.ts`, `navigation-config.test.ts`                   | Bilingual static pages, original content and configurable navigation; details in [I18N.md](I18N.md)                                                 |
| Infrastructure        | `tests/build/tooling/isolation.test.ts`, `interruption.test.ts`           | Independent fixture content/caches, unchanged source/root output, signal handling, process shutdown and retained diagnostics                        |
| Build                 | `tests/build/search.test.ts`, `base-path.test.ts`                         | Real Pagefind queries, draft exclusion, original-content deduplication, metadata, deployment prefixes and resource serving                          |
| Tooling               | `tests/unit/tooling/`                                                     | Content stub rejection, output-path decoding and dependency-consumer compatibility                                                                  |
| Tooling               | `tests/build/tooling/x18n-tooling.test.ts`                                | Translation-tool diagnostics and valid controls; rejected writes preserve files                                                                     |
| Browser               | `tests/e2e/deterministic/`                                                | User navigation, theme state, forms, keyboard access, narrow layouts, rendering and language switching                                              |
| AI browser            | `tests/e2e/ai/`                                                           | Rendering screenshot readability as an on-demand check                                                                                              |

Test Astro content collection behavior through real builds; the unit-only
`astro:content` stub rejects collection access.

For one-off sensitivity verification, inject faults only in temporary copies.
Require a successful build and parse, rejection by the intended contract assertion,
and a passing control after restoring the same fixture. Keep evidence in ignored
reports; do not add source-expression mutation switches to the fixture API.
A build crash is not evidence that an assertion detects the intended bug.
Expected fixture data must remain independent of production sorting, pagination,
slug and translation functions.

The existing `unit` and `build` projects include `tests/unit/**/*.test.ts` and
`tests/build/**/*.test.ts`, including their `tooling/` subdirectories. Tooling is
an ownership distinction, not an additional project or execution pass. Run each
project once; build tooling still requires root `dist` to be ready. Release maintenance, fixed-candidate publication, recovery, production-output,
and smoke contracts also run in the unit project.

To inspect collection without executing tests:

```sh
vp test list --project unit --project build --filesOnly
vp test list --project unit --project build
```

The list contains static definitions; parameterized cases expand during execution.
When relocating tests, compare mapped file/name pairs and actual runner counts,
check each file is collected once, and preserve every assertion or identify its
specific replacement. Keep migration inventories and command exit/time/build-count
reports in ignored `tests/test-results/qa-refactor/`, not in project guides.

Build suites share one read-only fixture per input configuration with
`beforeAll`/`afterAll`; splitting assertions into named contracts must not add
builds for the same input. SEO owns the full canonical/alternate and feed policy;
i18n and deployment-base suites keep representative wiring checks. Pagination
owns the 1/10/11/20/21 boundaries, exact page contents and same-origin navigation.
Controlled browser search tests start independently for pagination, stale queries
and excerpt rendering; real Pagefind queries remain in the build suite.

## Run unit and build tests

Use the Node and pnpm versions pinned in `package.json` and `pnpm-workspace.yaml`.
Run commands from the repository root:

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

`vp run check` generates Astro types before other checks. Use `vp run build`
for Astro; the built-in `vp build` runs plain Vite. Build tests reuse root `dist`
for default-route assertions and isolation fingerprints, so rebuild after source
or content changes. Normally build without a `SITE_URL` override to verify the
production subpath. If overriding it, pass the same `SITE_URL` when running build
tests so URL-to-output assertions use the matching deployment base.

For ordinary read-only builds, use `createBuiltFixture({ name, posts, siteUrl })`
from `tests/support/build-fixture.ts`. It builds once, checks success and returns
`dist`, `reportDir` and `dispose`; failed builds retain diagnostics and release
the temporary copy automatically. Share the returned output across read-only tests.

For schema failures, source/configuration edits, dev/preview or process tests,
use the lower-level `createFixture` from
`tests/support/build-fixture.ts` to work in an isolated temporary copy. Always
await `fixture.dispose()` in `finally` or `afterAll`, including failed tests.

For a focused run:

```sh
vp test --project unit tests/unit/posts.test.ts
vp test --project build tests/build/publication.test.ts
vp test --project build tests/build/tooling/isolation.test.ts tests/build/tooling/interruption.test.ts
```

`test:unit:tz` runs date tests in separate UTC, America/Los_Angeles and
Asia/Singapore processes. Use handwritten expected dates, including UTC year
boundaries, rather than generating expectations with the production formatter.
The command prints Node and ICU versions for reproducibility.

## Run E2E tests

Install browsers once, then build the current checkout:

```sh
pnpm exec e2e-web install chromium webkit
SITE_URL=https://sionrbot.github.io vp run build
SITE_URL=https://sionrbot.github.io pnpm run test:e2e -- --target desktop,narrow,webkit
SITE_URL=https://sionrbot.github.io pnpm run test:e2e -- --variant rendering --target desktop,narrow,webkit
SITE_URL=https://sionrbot.github.io pnpm run test:e2e -- --variant configured-forms --target desktop,narrow,webkit
SITE_URL=https://sionrbot.github.io pnpm run test:e2e -- --variant i18n --target desktop,narrow,webkit
pnpm run test:e2e -- --variant production-path
env -u SITE_URL vp run build
```

The browser and Lighthouse baseline serves the site at the domain root;
build it with the root `SITE_URL` above. The Pages deployment builds the configured
production subpath, covered by build assertions and the isolated `production-path`
preview journey. The runner checks an explicit `SITE_URL` against the existing home
canonical and gives preview the same deployment URL. Rebuild without the override
after root-path browser runs, including failures, before default build tests.

Linux CI uses a digest-pinned Playwright container with browsers and system
dependencies preinstalled. Keep the image and version checks in
`.github/workflows/ci.yml` and `.github/workflows/release.yml` aligned with `@e2e-dev/web`'s `playwright-core`
dependency when upgrading it. CI verifies the version and browser executables
before running tests. Targets are Chromium
`desktop` (1280×800), Chromium `narrow` (360×800) and WebKit `webkit` (360×800).
The default target selection is `desktop,narrow`, with one worker and no retries.
`production-path` runs desktop only and rejects other targets; the four existing
deterministic suites retain all three targets.

| Variant            | What to test                                                                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `default`          | Article/tag navigation, active links, 404 metadata, theme persistence/system changes/storage failures, keyboard focus/skip link, narrow pages and disabled forms |
| `rendering`        | Table/code/math scrolling stays inside content containers; page fits viewport; embedded controls remain usable; AI evaluates readability at content positions    |
| `configured-forms` | Required/email validation, exact native POST fields, default/custom newsletter fields and hidden values, popup submission and exactly one request                |
| `i18n`             | Language/page identity, original content, URL-selected UI, script-independent navigation and narrow layouts; deterministic only                                  |

The deterministic-only `production-path` variant creates a fixed public article in
an isolated fixture built at `https://fixture.example/blog/`. One desktop journey
follows home → article → real Pagefind unique-word query → Chinese search with the
same query → the same original article in Chinese UI. Exact URLs, result count,
article text and language are checked; the index is not mocked and root `dist`
is untouched. Empty-site/all-draft presentation remains unspecified and is not
assigned guessed expectations. Local preview does not certify hosted routing.

Form fixtures use fake credentials and intercepted local actions. Keep exact
payload, method and request-count assertions. Submission is deterministic and
checks exactly one request even when the native form opens a popup.

For AI tests, set `OPENAI_API_KEY` in the environment or an ignored `.env.e2e`
file with permissions `0600`. `E2E_MODEL` overrides the configured
`gpt-6.1-sol` model. AI interactions and visual judgments use the OpenAI Responses
API with `high` reasoning effort. Existing environment variables take precedence
over the file. Deterministic configuration does not load model credentials.

```sh
pnpm run test:e2e:visual -- --target desktop,narrow
pnpm run test:e2e:ai -- --variant rendering
pnpm run test:e2e -- --list
pnpm run test:e2e -- tests/e2e/deterministic/default/theme.e2e.ts --target desktop
pnpm run test:e2e:visual -- tests/e2e/ai/rendering/reading.e2e.ts --target desktop --no-cache
```

`test:e2e:visual` runs only the rendering screenshot suite and rejects other
variants. `test:e2e:ai` also defaults to rendering and rejects every other
variant. Deterministic forms include visible Contact and site-name navigation, and theme tests assert
immediate state as well as persistence. Visual assertions retain content positioning
and pixel evidence; DOM text is not a replacement. Without model credentials,
report visual validation as not executed, not passed.

AI runs consume model calls. Use `--no-cache` to verify a changed flow live;
inspect replay/model-call fields rather than inferring replay from duration.
The wrapper also accepts target, grep/tag, repeat, budget, retry and debug flags;
unknown arguments fail.

## Preview and interactive testing

The runner prepares a validated `E2E_RUN_MANIFEST`. The default variant reuses
root `dist`; each other variant builds an isolated fixture. E2E owns preview
startup/readiness/shutdown through `app.command`. The manifest carries `siteUrl`,
`sourceSha` and `sourceDirty`; preview uses that deployment URL. The SHA identifies
the checked-out source, and dirty runs must not be reported as exact commit evidence. Run one invocation per root
at a time. `--list` collects tests without starting preview. Cleanup failures
make the invocation fail.

For interactive work, use the project E2E skill and MCP registration in
`.codex/config.toml`. Without a manifest, `e2e.config.ts` provides a desktop dev
target on an available port. Set `APP_URL` to reuse a fixed local dev URL.
Production regression uses the wrapper commands above; an invalid supplied
manifest must fail instead of silently falling back to development.

## Reports and diagnosis

Fixture diagnostics are written to:

```text
tests/test-results/build/<run-id>/<fixture-name>-<uuid>/
  manifest.json
  build.log
  result.json
  resolved-config.json
  resolved-vite.json
  dev.log                 # when used
```

Start with the failing assertion and `build.log`; inspect `result.json` for the
process exit and output. Deliberately invalid schema cases must identify the
fixture/field and have a successful corrected control. Some early failures cannot
produce every file. Reproduce with the focused test; temporary fixture roots are
removed after disposal.

E2E reports remain in `.e2e/runs/<run-id>/<mode>/<variant>/`, including
`manifest.json`, `preview.log`, `runner.log`, `result.json`, `report.json`,
`junit.xml` and traces. Inspect `orchestrator.log` for setup/cleanup failures.
Generated reports are ignored by Git and formatting/lint tools. Keep run outcomes
in these artifacts or CI, rather than adding execution history to these guides.

## CI and coverage boundaries

[CI](../.github/workflows/ci.yml) runs one `verify` job on pull requests and manual
dispatch. It executes static checks, i18n, unit/timezone tests, a root-hosted
baseline build, build tests and internal links in order. Four explicit browser
steps run `default`, `i18n`, `configured-forms` and `rendering`, each on
`desktop,narrow,webkit`; a fifth runs `production-path` on desktop. Required
steps use command exit codes; an ordinary failure stops later verification.
The root build stays in the job's workspace and fixture suites build their own
isolated output. Diagnostics uploads preserve reports without changing test results.

The [release workflow](../.github/workflows/release.yml) repeats core validation
at the fixed merged version SHA before building and checking both production
targets. Publication, Pages deployment/smoke and Workers deployment/smoke have
independent observable results. Inspect remote runs separately from local results.

Rendering AI checks remain on demand through `test:e2e:visual`. Lighthouse keeps
its configured sampling pages and thresholds as a performance/accessibility
specialty tool, not a required PR score gate. With the root baseline built, run:

```sh
pnpm dlx @lhci/cli@0.15.1 autorun
```

Record relevant visual or performance findings with the source SHA. A specialty
check that was not run has no passing result.

Fixed desktop-browser viewports do not establish real-device behavior. Preview
404 checks do not establish hosting configuration. Keyboard/layout checks are
not a comprehensive accessibility audit, and AI readability checks do not provide
pixel baselines. Lighthouse covers only the pages in its configuration.
