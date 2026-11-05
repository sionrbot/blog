# Guide for AI agents

This is the first file you should read before editing this theme.

## Project Rules

1. **Use `astro add` for integrations**: Use `astro add` for official integrations (e.g. `astro add tailwind`, `astro add react`). For other packages, install using the command for your preferred package manager rather than editing `package.json` directly.
2. **Verify current APIs**: Check the latest documentation, especially for newer features like sessions and actions. This is also important for features that have seen significant changes since their initial launch, such as content collections, or previously experimental features that may no longer be experimental.
3. **Project-level documentation**: Describe only what the project does or requires and how to use, implement, or test it. Do not include intermediate progress, execution status, or results.

## Commands

```sh
vp install
vp run dev      # Astro dev server; default http://localhost:4321
vp fmt          # format with Oxfmt, including Astro and Tailwind class sorting
vp run check    # generate Astro types and check types + templates
vp check        # Vite+ formatting, Oxlint, and TypeScript checks
vp run lint     # Oxlint + ESLint, including Astro template rules
vp run build    # Astro production build; outputs dist/
vp run preview  # preview the Astro production build
```

Use `vp run` for Astro scripts: the built-in `vp dev`, `vp build`, and `vp preview` commands run plain Vite. Both `vp check` and `vp run check` are required to cover Vite+ checks and Astro templates.

Run `vp run check` before `vp check` or `vp run lint` on a fresh checkout so Astro generates content collection types.

After any change, `vp run check && vp check && vp run lint && vp run build` must pass.

## Where to edit

| To change                                | File                                                        | Notes                                                                                                                            |
| ---------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Site name, URL, description, social, nav | `src/config.ts`                                             | No site-specific values are hardcoded anywhere else                                                                              |
| Color palette                            | `@theme` block in `src/styles/global.css`                   | Tailwind v4 CSS variables. There is no `tailwind.config.*`                                                                       |
| Fonts                                    | `@theme` in `src/styles/global.css` + `src/assets/fonts/`   | Self-hosted. Never link external font services                                                                                   |
| Logo, favicon                            | `src/assets/logo.svg`, `public/favicon.svg`                 |                                                                                                                                  |
| Default OG image                         | `src/assets/og-default.png`                                 | 1200×630. Imported by `site.defaultOgImage` in `config.ts`                                                                       |
| Home section order and content           | `src/templates/Home.astro`                                  | Assembles components from `src/components/sections/` via props                                                                   |
| Add a section                            | `src/components/sections/<Name>.astro`                      | Props only, no data fetching                                                                                                     |
| Section inside a post                    | Wrap it in `<div class="not-prose breakout">` in the `.mdx` | `breakout` is an `@utility` in `global.css`. Never modify the section component                                                  |
| Add a blog post                          | `src/content/blog/<slug>.mdx`                               | Frontmatter schema below                                                                                                         |
| Content schema fields                    | `src/content.config.ts`                                     | Never remove fields; add new ones as optional                                                                                    |
| Header, footer                           | `src/components/common/Header.astro`, `Footer.astro`        | Link lists live in `config.ts`                                                                                                   |
| SEO meta                                 | `src/components/common/SEO.astro`                           | Pages only pass `title` / `description` props                                                                                    |
| New page                                 | Shared `src/templates/<Name>.astro` using `PageLayout`      | Thin entries in `src/pages/` and `src/pages/zh/`; shared authored MDX lives in `src/content/pages/`                              |
| UI strings (buttons, labels)             | `src/i18n/<locale>.ts`                                      | Never write UI strings inside components                                                                                         |
| UI language and routes                   | `src/i18n/locales.ts`, `src/i18n/links.ts`, `src/pages/`    | URL selects `en` (no prefix) or `zh-Hans` (`/zh/`). Components use `useT(Astro.currentLocale)`; system links use `localizedHref` |
| Newsletter, contact form                 | `forms` in `config.ts`                                      | Newsletter: `forms.newsletter.action`. Contact: Web3Forms key                                                                    |
| Analytics                                | `analytics` in `config.ts`                                  | Rendered by `src/components/common/Analytics.astro`                                                                              |

## Don't

- Don't change the props signature of components in `src/components/ui/`. Create a new component instead.
- Don't add client-side framework islands (React/Vue/Svelte). Use `<script>` tags and CSS for interaction.
- Don't use `<img>` directly. Use `<Image>` / `<Picture>` from `astro:assets`.
- Don't put images in `public/` (favicon and robots excepted). Put them in `src/assets/`.
- Don't link external CDNs (fonts, scripts, icons).
- Don't remove accessibility features (skip link, focus ring, alt, aria-label).
- Don't add third-party assets that aren't listed in `THIRD-PARTY-NOTICES.md`. If you add one, add the notice too.
- Don't add a `.prose` rule in `global.css` without the `:not(:where(.not-prose, .not-prose *))` guard. Embedded section components rely on it.

## Content schema (`src/content.config.ts`)

```
blog:
  title: string           # required
  description: string     # required, max 160 chars
  pubDate: date           # required
  updatedDate?: date
  lang?: string           # BCP 47 content language; defaults to en, independent of UI
  heroImage?: image       # path relative to the post, under src/assets
  heroAlt?: string        # required when heroImage is set
  tags: string[]          # default []
  draft: boolean          # default false; true excludes it from the build
```

Human-readable version: `docs/content.md`.

## Theme conventions

- Section components work from props only. The page passes the data.
- Use `@theme` variables (`--color-primary`, etc.) for color. No arbitrary hex values in classes.
- Dark mode uses the `dark:` variant, driven by the `html.dark` class.
- Mobile first. Anything that breaks at 360px is a bug.
- Section labels use the `section-label` utility (serif italic), placed in a `hang` grid so the label sits in the left margin. Don't use small uppercase text with wide letter-spacing.
- Rules, not boxes: separate content with `border-t`/`border-y`. Controls use `rounded-xs`. No pill buttons, `rounded-2xl` cards, gradients, glass, or heavy shadows.
- Vary section spacing and alignment to fit the content; don't give every section the same padding or center the closing block by default.
- Write copy in the site owner's voice: plain and specific.
- One component per file. No barrel `index.ts` files.

## Workflow

1. Find the file in the map above. If the request isn't covered, tell the user which files you plan to touch first.
2. Make the change.
3. Run `pnpm check && pnpm build` and report the result.
4. For visual changes (layout, color), start `pnpm dev` and ask the user to check.

## Tool notes

- For translation keys or locale changes, use the project `x18n` skill; use `x18n-check` for diagnostics and `x18n-setup` for configuration changes. For language routing, shared templates, content language, or SEO changes, read [docs/i18n-spec.md](docs/i18n-spec.md); project-specific workflow and scanner limits are in [test/I18N.md](test/I18N.md#agent-workflow).
- Use the configured x18n MCP tools for interactive work, or `pnpm exec x18n <command> --json` as the CLI fallback. Finish with `pnpm run i18n:check` and `pnpm run test:unit`; the normal project checks still apply.

- Run the dev server in the background: `pnpm astro dev --background` / `astro dev stop|status|logs`.
- TypeScript is pinned to 6.x. 7.x (native compiler) is not yet supported by `astro check` or typescript-eslint.
- Use the pnpm 11 version pinned in `package.json#packageManager` and `allowBuilds` in `pnpm-workspace.yaml`. Vite+ manages Node.js through `package.json#devEngines.runtime`; keep the workspace `nodeVersion` aligned with that pin. `runtimeOnFail: ignore` and `pmOnFail: ignore` prevent pnpm from duplicating Vite+ environment management.
