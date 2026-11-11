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
source. The [release workflow](../.github/workflows/release.yml) validates the
version PR's fixed merge SHA, builds for the Pages URL, checks its production
output, and saves it to `release-output/pages` before building Workers.
After both builds pass and the Release is public, the Pages job deploys that
run's native Pages artifact to the `github-pages` environment and performs GET
smoke checks. Only this job receives Pages write and OIDC permissions.

Production deployment follows merged version PRs, not ordinary `main` pushes.
Each platform consumes its own output from the same release run and attempt.
Before deploying, each job checks that the candidate is still the latest stable
Release and its tag still matches the fixed SHA. Superseded candidates skip
hosting changes.

For temporary deployment or smoke failures, use **Re-run all jobs** on the
original **Release fixed source** run. This repeats validation and both builds at
the original version and SHA. Deployment-only retries reject outputs from an
older attempt. Source defects require a repaired subsequent version; see
[release recovery](releasing.md#inspect-and-retry). Published history remains
unchanged. There is no manual arbitrary-tag deployment entry point.

Use the workflow's deployment URL to open the site. The Chinese UI is under
`/blog/zh/`. Preview locally with `pnpm preview` and open the same
`/blog/` prefix. GitHub Pages serves the generated root `404.html` for
unknown URLs; it does not automatically choose the Chinese error page.

## Cloudflare Workers

The release workflow also builds for
https://sionrbot-blog.pgsnotfound404.workers.dev. Its domain and root path differ
from Pages, so the preparation job checks this output separately and packages
`.cloudflare/output/` with `cf-wrangler build`. The Workers job checks out the
fixed SHA for tooling, downloads this run's prebuilt output, and runs
`cf deploy --prebuilt`, followed by GET smoke checks. Pages and Workers run
independently; a failure in one leaves the workflow failed while the other still
attempts deployment and smoke.

Set repository Actions secrets `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID`. The token needs Workers Scripts Write for the target
account. This static deployment uses the workers.dev hostname and no DNS, KV,
R2, or server-side Astro adapter.

For a local build or a separate local deployment, use the Workers URL so navigation,
assets, feeds, and SEO metadata use the root path. Keep `site.url` unchanged for
GitHub Pages. The preparation job uses the same build and verification steps before publication:

```sh
export SITE_URL=https://sionrbot-blog.pgsnotfound404.workers.dev
pnpm build
pnpm exec vp test --project build tests/build/base-path.test.ts tests/build/routes.test.ts tests/build/seo.test.ts
node scripts/check-production-output.ts dist "$SITE_URL"
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

## CI and deployment verification

[CI](../.github/workflows/ci.yml) runs one `verify` job on pull requests and manual
dispatch, with a fixed root-hosted test URL. It installs dependencies once, runs
source/translation/unit/timezone checks, builds the baseline, checks build
contracts and internal links, and runs the four deterministic browser suites on
`desktop,narrow,webkit` plus the `production-path` desktop journey. The baseline
stays in the same job's workspace. Diagnostics are uploaded for inspection.

Lighthouse and rendering AI checks are on-demand tools; see
[Testing](../tests/TESTING.md). PR validation, release preparation, publication,
and each platform's deployment and smoke remain separate outcomes. Test URLs,
Pages output, and Workers output cannot be interchanged.

After deployment, `scripts/smoke-site.ts` performs bounded GET checks for the
home, Chinese, and search pages, Pagefind JavaScript, and a random missing path.
It requires correct statuses and content types and rejects HTML fallback for
JavaScript. It does not submit forms or replace full browser regression.
Local preview success does not establish hosted availability; inspect both
platforms' actual smoke steps in the fixed-source release run.
