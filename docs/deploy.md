# Deploy

Pilcrow builds to a static site in `dist/`. There is no server runtime to configure.

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

## Cloudflare Pages

Build command: `pnpm build`. Output directory: `dist`.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/ondelva/astro-theme-pilcrow)

## Vercel

Framework preset: Astro. Build command: `pnpm build`. Output directory: `dist`.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/ondelva/astro-theme-pilcrow)

## Netlify

Build command: `pnpm build`. Publish directory: `dist`.

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/ondelva/astro-theme-pilcrow)

## CI

`.github/workflows/ci.yml` runs on every push to `main` and on pull requests: install, `pnpm check` (including Astro type generation), `pnpm exec vp check`, `pnpm lint`, `pnpm build`, a Lighthouse run, and an internal link check against `dist`. Use it as a reference for what a deploy pipeline should verify before shipping.
