# Pilcrow

A quiet, typography-first Astro theme for writers. Good type, generous measure, nothing else in the way.

[Live demo](https://pilcrow-free.ondelva.com) · [Pro demo](https://pilcrow.ondelva.com) · [Get Pro](https://buy.polar.sh/polar_cl_8dCt7ufpdKweXNgPSp3DH73SlxkMoirMTbBuF3WJooD?utm_source=github)

What's new: [release notes](https://github.com/ondelva/astro-theme-pilcrow/releases) · [changelog in the demo](https://pilcrow-free.ondelva.com/whats-new/)

![screenshot](docs/screenshots/home-light.png)

## Features

- Astro 7 + Tailwind CSS v4, zero client-side JS by default
- Blog with tags, pagination, RSS, sitemap, JSON-LD
- Dark mode, responsive from 360px, Lighthouse 95+
- Type-safe content collections (MDX)
- `AGENTS.md` included — works out of the box with Claude Code / Cursor

## Quick start

Use the Node.js version pinned in `package.json#devEngines.runtime` and the pnpm 11 version pinned in `package.json#packageManager`. Vite+ selects both versions automatically. `pnpm-workspace.yaml#nodeVersion` matches the runtime pin for dependency engine checks; Vite+ manages the actual runtime. Without Vite+, install the declared Node.js version and run `npm i -g pnpm@11.28.10`.

```sh
pnpm create astro@latest my-site -- --template ondelva/astro-theme-pilcrow
cd my-site
pnpm install
pnpm dev
```

## Configure

Edit `src/config.ts`. Everything site-specific lives there: name, URL, navigation, social links, SEO defaults.
Colors and fonts: `src/styles/global.css` (`@theme` block). See [docs/customization.md](docs/customization.md).

## Deploy

Static output. Works on Cloudflare Pages, Vercel, Netlify.

[![Deploy to Cloudflare Pages](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/ondelva/astro-theme-pilcrow)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/ondelva/astro-theme-pilcrow)

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/ondelva/astro-theme-pilcrow)

See [docs/deploy.md](docs/deploy.md).

## Free vs Pro

This is the free, MIT-licensed edition. Pilcrow Pro is built on the same code and adds the following ([Pro demo](https://pilcrow.ondelva.com)):

|                | Free                                                                 | Pro                                                                                           |
| -------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Pages          | Home, About, Blog, Contact, Privacy, Terms, 404                      | + Pricing, Features, Team, Newsletter, Changelog, Docs, Work, Cookies, Accessibility          |
| Home sections  | 5                                                                    | 20                                                                                            |
| Blog           | Tags, pagination, RSS                                                | + Authors, series, table of contents, reading time, related posts, callouts, copy-code button |
| SEO            | Meta, Open Graph, sitemap, JSON-LD                                   | + Generated Open Graph image per post                                                         |
| Search         | –                                                                    | Pagefind                                                                                      |
| i18n           | This fork: en/zh-Hans UI, static routes, language switcher, hreflang | Localized routes, language switcher, hreflang                                                 |
| Integrations   | Analytics, Web3Forms contact form                                    | + Buttondown / Kit newsletter, Giscus comments, in-page form submit                           |
| Theme variants | 1 color preset                                                       | 4 color presets, 3 font pairings                                                              |
| Footer credit  | One line, easy to remove                                             | None                                                                                          |
| Support        | GitHub Issues                                                        | Email (im@ondelva.com), 2 business days                                                       |

[See the Pro demo →](https://pilcrow.ondelva.com) · [Get Pro →](https://buy.polar.sh/polar_cl_8dCt7ufpdKweXNgPSp3DH73SlxkMoirMTbBuF3WJooD?utm_source=github)

## License

[MIT](LICENSE).
Third-party assets: [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)

### Vite+ tooling

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

See [Testing](tests/TESTING.md) for unit, build, browser and AI test coverage and commands.
[Language testing](tests/I18N.md) covers bilingual UI contracts and translation tooling.
