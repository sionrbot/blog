# Sionrbot blog

Sionrbot personal blog is a personal blog built with Astro, extensively customized from [ondelva's Pilcrow](https://github.com/ondelva/astro-theme-pilcrow).

## Features

- Astro 7 + Tailwind CSS v4, static pages with browser scripts for interactive controls
- Blog with tags, pagination, Pagefind search, RSS, sitemap, JSON-LD
- English and Simplified Chinese UI routes sharing original-language content
- Dark mode and layouts designed for widths from 360px
- On-demand Lighthouse checks with 95-point thresholds
- Type-safe content collections (MDX)
- Repository conventions and verification commands in `AGENTS.md`

## Quick start

Use the Node.js runtime and pnpm version pinned in `package.json`; the workspace
also records the Node.js pin in `pnpm-workspace.yaml`. Install dependencies and start Astro:

```sh
vp install
vp run dev
```

Vite+ provides Vite, Oxlint, and Oxfmt; its version is pinned in the workspace
catalog in `pnpm-workspace.yaml`. Its lint and format settings live in
`vite.config.ts`; Astro application settings stay in `astro.config.mjs`.

- `pnpm check` generates Astro content collection types and runs its template-aware type checker.
  Run it before the Vite+ checks on a fresh checkout.
- `pnpm exec vp check` checks formatting, lint, and TypeScript through Vite+.
- `pnpm lint` runs Oxlint and the retained ESLint rules, including Astro template checks
  that Oxlint does not enforce.
- `pnpm format` formats with Oxfmt, including Astro and Tailwind class sorting.
- `pnpm dev`, `pnpm build`, and `pnpm preview` keep using Astro. With a global Vite+
  CLI, use `vp run dev`, `vp run build`, and `vp run preview` for these scripts.
  The built-in `vp dev` / `vp build` / `vp preview` commands run plain Vite and do
  not load Astro's application pipeline.

## Configure

Edit `src/config.ts`. Everything site-specific lives there: name, URL, navigation, social links, SEO defaults.
Colors and fonts: `src/styles/global.css` (`@theme` block). See [docs/customization.md](docs/customization.md).

## Deploy

Astro produces static output in `dist/`. The release workflow builds separate
outputs for GitHub Pages (`/blog/`) and Cloudflare Workers (domain root).

See [docs/deploy.md](docs/deploy.md).

## Releases

Development merges into `main`; promotion PRs bring selected changes into `release`.
Pushes to `release` maintain a software version PR. Merging that version PR fixes
its merge SHA, runs validation, builds both production targets, then publishes a
GitHub Release and deploys each target with its own GET smoke check. Content-only
deployment uses an explicit dispatch for the full current `release` SHA and retains
the existing software version. Ordinary feature and promotion merges do not deploy.

PR CI uses one `verify` job, with a formatting-only path for development-document
changes and full verification for other changes. Release preparation always runs
full verification.
See [docs/releasing.md](docs/releasing.md) for setup, commit conventions, and retries.

## Test

See [Testing](tests/TESTING.md) for unit, build, browser and AI test coverage and commands.
[Language testing](tests/I18N.md) covers bilingual UI contracts and translation tooling.

## License

[MIT](LICENSE).
Third-party assets: [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)
