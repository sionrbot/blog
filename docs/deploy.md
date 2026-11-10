# Deploy

Sionrbot personal blog builds to a static site in `dist/`. There is no server runtime to configure.

## Before you deploy

Set `site.url` in `src/config.ts` to your production URL. It is used for canonical links, RSS, and the sitemap.

## Requirements

- Node.js pinned in `package.json#devEngines.runtime`. Keep `pnpm-workspace.yaml#nodeVersion` aligned with this version for dependency engine checks. Vite+ selects the runtime from `package.json`.
- pnpm 11, pinned in `package.json#packageManager`. Vite+ selects this version automatically. Without Vite+, install the declared Node.js version and the exact pnpm version:

```sh
npm i -g "$(node -p "require('./package.json').packageManager.split('+')[0]")"
```

## Build

```sh
pnpm install
pnpm build
```

Output goes to `dist/`.

## GitHub Pages

The production URL is https://sionrbot.github.io/blog/.
For a standard GitHub Pages project site, deploy from the `sionrbot/blog`
repository: GitHub derives the public path from the repository name. Changing
`site.url` alone does not rename the repository or change its Pages address.
`site.url` in `src/config.ts` includes the repository path. Astro derives its
`site` origin and `base` path from that URL; `SITE_URL` can override both for a
separate deployment or a root-hosted test build.

In the repository's **Settings → Pages**, select **GitHub Actions** as the build
source. CI builds and validates the Pages archive on the Release PR. After merge,
the Release workflow verifies the PR evidence and publishes the archive with the
release, then calls `.github/workflows/deploy.yml`. The deploy workflow verifies
the release manifest, tag, source tree, and archive digests, extracts `pages.tar`,
and uploads it to the `github-pages` environment. It does not rebuild the site.

Production deployment follows published releases, not ordinary `main` pushes.
Pages and Workers each receive their platform-specific archive from the same
release. Source checks, E2E, build tests, and production packaging happen before
merge; deployment only verifies and transfers those outputs.

To retry deployment, use **Actions → Deploy release to GitHub Pages and Cloudflare Workers
→ Run workflow**, select `main`, and supply `release_tag` such as `v1.8.0`.
Only the latest published stable release is accepted, preventing an older queued
run from replacing a newer release. Its `pages.tar`, `workers.tar`, and
`release-manifest.json` must all be present and valid. Legacy releases without
these assets cannot be deployed through this workflow. GitHub Pages uses the
generated token; no personal token or domain configuration is needed.

Use the workflow's deployment URL to open the site. The Chinese UI is under
`/blog/zh/`. Preview locally with `pnpm preview` and open the same
`/blog/` prefix. GitHub Pages serves the generated root `404.html` for
unknown URLs; it does not automatically choose the Chinese error page.

## Cloudflare Workers

The same deployment workflow publishes the prebuilt Workers archive to
https://sionrbot-blog.pgsnotfound404.workers.dev. CI creates this archive with the
Workers URL because its domain and root path differ from Pages. After release
verification, the Workers job runs independently of the Pages jobs. It checks out
the recorded release source for the deployment tool and configuration, restores
`.cloudflare/output/`, and runs `cf deploy --prebuilt`.

Set repository Actions secrets `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID`. The token needs Workers Scripts Write for the target
account. This static deployment uses the workers.dev hostname and no DNS, KV,
R2, or server-side Astro adapter.

For a local build or a separate local deployment, use the Workers URL so navigation,
assets, feeds, and SEO metadata use the root path. Keep `site.url` unchanged for
GitHub Pages. These build commands are not repeated by the release deployment job:

```sh
export SITE_URL=https://sionrbot-blog.pgsnotfound404.workers.dev
pnpm build
pnpm exec vp test --project build tests/build/base-path.test.ts tests/build/routes.test.ts tests/build/seo.test.ts
pnpm exec cf-wrangler build
pnpm exec cf deploy --prebuilt --dry-run
pnpm exec cf deploy --prebuilt
```

For local deployment, authenticate with `cf auth login` or supply the two
Cloudflare environment variables. CI receives credentials only in the deploy step.

`wrangler.config.ts` packages `dist/` as `.cloudflare/output/v0/` using Wrangler's
`cf-wrangler` binary. `cloudflare.config.ts` defines the Worker and static routing.
The prebuilt commands bypass `cf` framework detection, which does not support
Astro 6+ during the beta. Tool versions are pinned in the project lockfile.
Do not use `cf build` or plain `cf deploy` for this project.

Unknown URLs return the generated root `404.html` with HTTP 404. Chinese pages
remain under `/zh/`; missing Chinese paths also use the root error page.

## Cloudflare Pages

Build command: `pnpm build`. Output directory: `dist`.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/sionrbot/blog)

## Vercel

Framework preset: Astro. Build command: `pnpm build`. Output directory: `dist`.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/sionrbot/blog)

## Netlify

Build command: `pnpm build`. Publish directory: `dist`.

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/sionrbot/blog)

## CI

`.github/workflows/ci.yml` and `.github/workflows/e2e.yml` run on pull requests and
manual dispatch, not on `main` pushes. Superseded runs for the same PR are
cancelled. Release publication requires successful PR-triggered runs; manual runs
do not produce release evidence.

The CI build job installs dependencies, runs Astro checks (including type
generation), Vite+ checks, ESLint, translation checks, unit tests and timezone
tests, then builds the root-hosted baseline once. Vite+ already runs Oxlint, so
CI invokes ESLint directly instead of repeating Oxlint through `pnpm lint`.

Build tests and Lighthouse/internal-link checks download the same baseline
artifact by immutable ID and run in parallel. Baseline artifacts are retained for
seven days. The final `quality` check requires all those jobs to succeed.

For the same-repository Release PR targeting `main`, `release-builds` separately
builds Pages and Workers output, runs the deployment build tests for each target,
and packages the Workers output with `cf-wrangler build` and a dry-run deployment.
That job must also succeed before `quality` passes. It uploads the production
archives and source evidence as `release-bundle-<attempt>`, retained for 90 days.
Other PRs deliberately skip this job.

E2E's default variant builds the baseline once for deterministic and AI tests.
Other variants build isolated fixtures inside the runner. Runner and fixture
lifecycles remain independent between suites. After every variant succeeds, a
Release PR receives `e2e-evidence-<attempt>`, also retained for 90 days.

CI baseline, Pages, and Workers builds use different deployment URLs; their
output must not be interchanged. [Releasing](releasing.md) defines how the
publisher matches the PR runs and source trees to the merged release commit.
