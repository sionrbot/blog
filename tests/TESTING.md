# Testing

Test source, testing guides and generated fixture reports live in `tests/`. Commands and runner settings are defined in `package.json`,
`vite.config.ts`, `e2e.config.ts`, `e2e.ai.config.ts` and `.github/workflows/`.
See [I18N.md](I18N.md) for language contracts and translation tooling.

## What to test

| Layer                 | Source                                                                          | Contracts                                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit                  | `tests/unit/`                                                                   | Post/tag links and normalization; UTC dates and locale formatting; dictionaries, interpolation, locale fallback and localized page identities                    |
| Build and integration | `tests/build/publication.test.ts`, `pagination.test.ts`, `routes.test.ts`       | Draft exclusion across public surfaces, dev draft visibility, publication order, normalized tags, exact pagination and route availability                        |
| Build                 | `tests/build/seo.test.ts`, `schema.test.ts`                                     | Canonical/OG/JSON-LD/RSS/sitemap/robots consistency; escaped titles; dates, content language, hero alt text and schema defaults                                  |
| Build                 | `tests/build/rendering.test.ts`, `page-math.test.ts`                            | Markdown/MDX math, recoverable formula errors, conditional KaTeX styles, tables, checkboxes and shared-page layouts                                              |
| Build                 | `tests/build/i18n.test.ts`, `navigation-config.test.ts`, `x18n-tooling.test.ts` | Bilingual static pages, original content, configurable navigation and translation-tool integration; details in [I18N.md](I18N.md)                                |
| Infrastructure        | `tests/build/isolation.test.ts`, `interruption.test.ts`                         | Independent fixture content/caches, unchanged source/root output, field-specific errors and controls, signal handling, process shutdown and retained diagnostics |
| Browser               | `tests/e2e/deterministic/`                                                      | User navigation, theme state, forms, keyboard access, narrow layouts, rendering and language switching                                                           |
| AI browser            | `tests/e2e/ai/`                                                                 | Reading/navigation goals, theme selection, form discovery/submission and screenshot-based readability checks with exact assertions                               |

Test Astro content collection behavior through real builds; the unit-only
`astro:content` stub rejects collection access.

Publication and pagination tests include deliberate isolated mutations. Require a
successful build and parse before checking that the contract rejects the mutated
output. A build crash is not evidence that an assertion detects the intended bug.
Expected fixture data must remain independent of production sorting, pagination,
slug and translation functions.

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

For tests that modify content or configuration, use `createFixture` from
`tests/support/build-fixture.ts` to work in an isolated temporary copy. Always
await `fixture.dispose()` in `finally` or `afterAll`, including failed tests.

For a focused run:

```sh
vp test --project unit tests/unit/posts.test.ts
vp test --project build tests/build/publication.test.ts
vp test --project build tests/build/isolation.test.ts tests/build/interruption.test.ts
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
pnpm run test:e2e -- --target desktop,narrow,webkit
pnpm run test:e2e -- --variant rendering --target desktop,narrow,webkit
pnpm run test:e2e -- --variant configured-forms --target desktop,narrow,webkit
pnpm run test:e2e -- --variant i18n --target desktop,narrow,webkit
```

The existing browser and Lighthouse baseline serves the site at the domain root;
build it with the root `SITE_URL` above. The Pages deployment builds the configured
production subpath, which is covered separately by build assertions. Rebuild without
the override before running the default production build tests or deploying.

Linux CI uses a digest-pinned Playwright container with browsers and system
dependencies preinstalled. Keep the image and version checks in
`.github/workflows/e2e.yml` aligned with `@e2e-dev/web`'s `playwright-core`
dependency when upgrading it. CI verifies the version and browser executables
before running tests. Targets are Chromium
`desktop` (1280×800), Chromium `narrow` (360×800) and WebKit `webkit` (360×800).
The default target selection is `desktop,narrow`, with one worker and no retries.

| Variant            | What to test                                                                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `default`          | Article/tag navigation, active links, 404 metadata, theme persistence/system changes/storage failures, keyboard focus/skip link, narrow pages and disabled forms |
| `rendering`        | Table/code/math scrolling stays inside content containers; page fits viewport; embedded controls remain usable; AI evaluates readability at content positions    |
| `configured-forms` | Required/email validation, exact native POST fields, default/custom newsletter fields and hidden values, popup submission and exactly one request                |
| `i18n`             | Language/page identity, original content, URL-selected UI, script-independent navigation and narrow layouts; deterministic only                                  |

Form fixtures use fake credentials and intercepted local actions. Keep exact
payload, method and request-count assertions. AI fills newsletter fields; the test
submits once deterministically because a popup does not change the source page.
AI navigation goals also require exact URL/heading assertions.

For AI tests, set `OPENAI_API_KEY` in the environment or an ignored `.env.e2e`
file with permissions `0600`. `E2E_MODEL` overrides the configured
`gpt-6.1-sol` model. AI interactions and visual judgments use the OpenAI Responses
API with `high` reasoning effort. Existing environment variables take precedence
over the file. Deterministic configuration does not load model credentials.

```sh
pnpm run test:e2e:ai -- --target desktop,narrow
pnpm run test:e2e:ai -- --variant rendering
pnpm run test:e2e:ai -- --variant configured-forms
pnpm run test:e2e -- --list
pnpm run test:e2e -- tests/e2e/deterministic/default/theme.e2e.ts --target desktop
pnpm run test:e2e:ai -- tests/e2e/ai/default/reading.e2e.ts --target desktop --no-cache
```

AI runs consume model calls. Use `--no-cache` to verify a changed flow live;
inspect replay/model-call fields rather than inferring replay from duration.
The wrapper also accepts target, grep/tag, repeat, budget, retry and debug flags;
unknown arguments fail.

## Preview and interactive testing

The runner prepares a validated `E2E_RUN_MANIFEST`. The default variant reuses
root `dist`; each other variant builds an isolated fixture. E2E owns preview
startup/readiness/shutdown through `app.command`. Run one invocation per root
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
  sensitivity.json        # mutation checks
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

The quality workflow runs static checks, i18n, unit/timezone tests, a production
build, build tests, Lighthouse and internal links. E2E runs automatically on pull
requests and pushes to main; manual dispatch is also available. Deterministic
jobs cover all four variants and three targets. AI jobs cover `default`,
`rendering` and `configured-forms` on Chromium desktop/narrow and require the
`OPENAI_API_KEY` Actions secret. Secret availability follows repository settings.

CI uploads fixture diagnostics on quality failure and E2E reports/fixture logs
for E2E jobs that are not cancelled. Inspect remote runs separately from local
results.

Fixed desktop-browser viewports do not establish real-device behavior. Preview
404 checks do not establish hosting configuration. Keyboard/layout checks are
not a comprehensive accessibility audit, and AI readability checks do not provide
pixel baselines. Lighthouse covers only the pages in its configuration.
