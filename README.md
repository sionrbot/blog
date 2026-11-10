# Sionrbot blog

Sionrbot personal blog is a personal blog built with Astro, extensively customized from [ondelva's Pilcrow](https://github.com/ondelva/astro-theme-pilcrow).

## Features

- Astro 7 + Tailwind CSS v4, zero client-side JS by default
- Blog with tags, pagination, RSS, sitemap, JSON-LD
- Dark mode, responsive from 360px, Lighthouse 95+
- Type-safe content collections (MDX)
- `AGENTS.md` included — works out of the box with Claude Code / Cursor

## Quick start

Vite+ 1.4.0 provides Vite, Oxlint, and Oxfmt. Its lint and format settings live in
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

Static output. Works on Cloudflare Pages, Vercel, Netlify.

See [docs/deploy.md](docs/deploy.md).

## Releases

Release PRs maintain version numbers and changelog entries. CI and E2E validate
the Release PR and prepare production archives before merge. Merging it publishes
a tag and GitHub Release after verifying the merged source matches that evidence,
then deploys the same archives to GitHub Pages and Cloudflare Workers. Ordinary
`main` pushes do not deploy.
See [docs/releasing.md](docs/releasing.md) for setup, commit conventions, and retries.

## Test

See [Testing](tests/TESTING.md) for unit, build, browser and AI test coverage and commands.
[Language testing](tests/I18N.md) covers bilingual UI contracts and translation tooling.

## License

[MIT](LICENSE).
Third-party assets: [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)
