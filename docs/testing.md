# Testing

This repository implements phases A0 and A of the testing plan: unit test,
build artifact test, and the development-server integration test. It has no
E2E test runner, browser dependency, or model provider configuration.

This document describes the implemented scope, including the two Spec P2 fixes.
The source of truth is `package.json`, `vite.config.ts`, `tests/`, and
`.github/workflows/ci.yml`. Phases B1, B2 and C remain outside this implementation.
The `build` runner project includes build artifact test and integration test;
its name does not mean every case only inspects static output.

## Run locally

Use the Node and pnpm versions pinned in `package.json` and
`pnpm-workspace.yaml`. On a fresh checkout, generate Astro's content types
before running the other checks:

```sh
vp install
vp run check
vp check
vp run lint
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
```

`test:unit:tz` starts separate processes for UTC, America/Los_Angeles and
Asia/Singapore. Each checks the actual date formatter output against the same
handwritten expectations, including UTC year boundaries. It prints the Node
and ICU versions to make failures reproducible.

## What is covered

| Layer               | Files                              | Contract                                                                                                                                                                                          |
| ------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| unit test           | `tests/unit/posts.test.ts`         | Tag normalization, tag/post links, and refusal to load collections through the unit stub                                                                                                          |
| unit test           | `tests/unit/dates.test.ts`         | UTC dates, year boundaries, leap day and requested locale                                                                                                                                         |
| unit test           | `tests/unit/i18n.test.ts`          | Dictionary keys, placeholders, nonempty translations and locale fallback                                                                                                                          |
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

Current case inventory (parameterized cases counted individually):

| Runner project | File                               | Cases |
| -------------- | ---------------------------------- | ----: |
| unit           | `tests/unit/posts.test.ts`         |     8 |
| unit           | `tests/unit/dates.test.ts`         |     5 |
| unit           | `tests/unit/i18n.test.ts`          |     8 |
| build          | `tests/build/isolation.test.ts`    |     2 |
| build          | `tests/build/publication.test.ts`  |     3 |
| build          | `tests/build/pagination.test.ts`   |     8 |
| build          | `tests/build/routes.test.ts`       |     2 |
| build          | `tests/build/interruption.test.ts` |     2 |

There are 21 unit cases and 17 build-project cases. The timezone command reruns
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
  archives available diagnostics, removes all registered fixtures, and exits with status
  130/143. The overall interruption deadline is 30 seconds; cleanup failures are printed.
  SIGKILL or forced termination before cleanup completes cannot guarantee cleanup.
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
