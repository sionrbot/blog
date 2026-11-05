# Deploy

Sionrbot-blog builds to a static site in `dist/`. There is no server runtime to configure.

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

This repository publishes to https://sionrbot.github.io/sionrbot-blog/.
`site.url` in `src/config.ts` includes the repository path. Astro derives its
`site` origin and `base` path from that URL; `SITE_URL` can override both for a
separate deployment or a root-hosted test build.

In the repository's **Settings → Pages**, select **GitHub Actions** as the build
source. `.github/workflows/deploy.yml` validates and builds the site on pushes to
`main` that change `src/**`, `public/**`, `astro.config.mjs`, `tsconfig.json`,
`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.npmrc`, or the deployment
workflow itself. It then uploads `dist/` and deploys it to the `github-pages`
environment. Changes limited to documentation, tests, or other CI workflows do
not trigger an automatic deployment.
The workflow can also be started from **Actions → Deploy to GitHub Pages and Cloudflare Workers → Run
workflow**. Deployment uses GitHub's generated token; no personal token or domain
configuration is needed.

Use the workflow's deployment URL to open the site. The Chinese UI is under
`/sionrbot-blog/zh/`. Preview locally with `pnpm preview` and open the same
`/sionrbot-blog/` prefix. GitHub Pages serves the generated root `404.html` for
unknown URLs; it does not automatically choose the Chinese error page.

## Cloudflare Workers

The same deployment workflow publishes an independent build to
https://sionrbot-blog.pgsnotfound404.workers.dev. Both platforms share the existing
push path filters and manual trigger. Changes only to `cloudflare.config.ts` or
`wrangler.config.ts` require a manual workflow run. The Workers job runs
independently of the GitHub Pages jobs.

Set repository Actions secrets `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID`. The token needs Workers Scripts Write for the target
account. This static deployment uses the workers.dev hostname and no DNS, KV,
R2, or server-side Astro adapter.

Build and validate using the Workers URL so navigation, assets, feeds, and SEO
metadata use the root path. Keep `site.url` unchanged for GitHub Pages:

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

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/sionrbot/sionrbot-blog)

## Vercel

Framework preset: Astro. Build command: `pnpm build`. Output directory: `dist`.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/sionrbot/sionrbot-blog)

## Netlify

Build command: `pnpm build`. Publish directory: `dist`.

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/sionrbot/sionrbot-blog)

## CI

`.github/workflows/ci.yml` runs on every push to `main` and on pull requests: install, `pnpm check` (including Astro type generation), `pnpm exec vp check`, `pnpm lint`, `pnpm build`, a Lighthouse run, and an internal link check against `dist`. Use it as a reference for what a deploy pipeline should verify before shipping.
