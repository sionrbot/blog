# Customization

Everything site-specific lives in `src/config.ts`, `src/styles/global.css`, and `src/assets/`. You should not need to touch component files for the changes below.

## Site identity

`src/config.ts`, `site` object:

- `name` — shown in the header and page titles.
- `description` — used for meta description and RSS.
- `url` — your production URL. Set this before deploying; it feeds canonical links, RSS, and sitemap.
- `locale` — the default `en` value from `src/i18n/locales.ts`. Visitor UI language is selected by the URL: English without a prefix, Simplified Chinese under `/zh/`. See [UI strings](#ui-strings).
- `author` — shown in the footer and JSON-LD structured data.
- `defaultOgImage` — imported from `src/assets/og-default.png` (see below).

## Footer

The footer displays the current year and `site.author`. Set the author in `src/config.ts`.
Social links, including the project's GitHub repository, come from `nav(t).social`;
footer navigation comes from `nav(t).footer`. Edit `src/components/common/Footer.astro`
to change the footer layout.

## Navigation and social links

`src/config.ts`, `nav(t)` function, where `t` is the current UI dictionary:

- `nav(t).header` — top bar links (`label`, `href`); use a literal dictionary reference such as `label: t.blog`. Keep it short; four links fit a phone.
- `nav(t).footer` — array of groups, each with a translated `title` such as `t.legal` and a `links` array using `label` and `href`.
- `nav(t).social` — icon links (`label`, `href`, `icon`; icon names are `lucide:*` via astro-icon). Your own SVG icons go in `src/icons/`; `src/icons/logo.svg` is referenced as `logo`.

Header and footer site paths such as `/about/` follow the current UI language. External URLs, protocol-relative URLs, and fragment-only links retain their configured destinations. Keep literal `t.key` references in `nav(t)` so x18n can scan them.

## Color tokens

`src/styles/global.css`, inside the `@theme` block:

- `--color-background`, `--color-foreground`, `--color-muted`, `--color-border`, `--color-primary`.
- Dark mode values are set in the adjacent `.dark` block (same variable names).
- Use hex values only. After changing a color, re-check text contrast against the background (WCAG AA, 4.5:1) in light and dark. The comment above the tokens lists the current ratios. Preview tokens in dev at `/styleguide` (not built into production).
- Only use these `@theme` tokens in components; do not put arbitrary hex values in classes.

## Self-hosted fonts

Font files live in `src/assets/fonts/` (woff2, self-hosted, licensed under the OFL files alongside them) and are declared with `@font-face` at the top of `src/styles/global.css`. Do not add external font CDN links (e.g. Google Fonts `<link>` tags); add a self-hosted file instead.

## Logo and favicon

- Logo: `src/assets/logo.svg`.
- Favicon: `public/favicon.svg` (favicon is one of the few files allowed directly under `public/`).

## Default OG image

`src/assets/og-default.png`, 1200x630. Imported by `src/config.ts` as `site.defaultOgImage` and used whenever a page or post has no more specific image.

## Home page sections

`src/templates/Home.astro` imports section components from `src/components/sections/` and passes them props to compose the home page; edit this file to reorder or change home page content. Available sections: `Hero`, `RecentPosts`, `Features`, `Newsletter`, `CTA`. Section components only accept props; they do not fetch their own data.

## Section components in a post

Section components are not limited to the home page. Any of `Hero`, `RecentPosts`, `Features`,
`Newsletter`, and `CTA` can be dropped into the body of a post or a page, for the places where a
list or a call to action reads better than a paragraph.

Two classes decide how it lands:

- **`.not-prose`** stops the body styles (`.prose`) from restyling the component's headings, lists,
  quotes, and tables. Every `.prose` rule honours it, so the component keeps the look it has on the
  home page.
- **`.breakout`** lets the component escape the reading column and span the viewport. Section
  components re-center themselves at `max-w-5xl`, so this restores the width they have on the home
  page rather than making them full-bleed. Omit it to keep the component at reading width.

Import the component at the top of the `.mdx` file and wrap it:

```mdx
---
title: What I changed this year
description: A short review.
pubDate: 2026-03-02
---

import Features from '../../components/sections/Features.astro';

Normal prose stays at the reading measure.

<div class="not-prose breakout">
  <Features
    title="Findings"
    items={[
      { title: 'A visible spine', body: 'Descriptive headings beat clever ones.' },
      { title: 'Somewhere to stop', body: 'Readers resume at a section break.' },
    ]}
  />
</div>

And the prose picks up again here.
```

The import path is relative to the content file: `../../components/sections/` from
`src/content/blog/`.

Notes:

- No section component needs to be modified or copied to be used this way.
- `.breakout` relies on `overflow-x: clip` on `html` (set in `src/styles/global.css`). Keep it, or a
  classic scrollbar will add horizontal scrolling.
- The utility is defined once in `src/styles/global.css` (`@utility breakout`) and works in any
  `.prose` body.

## UI strings

The UI dictionaries are `src/i18n/en.ts` and `src/i18n/zh-Hans.ts`. Components read `useT(Astro.currentLocale)`; the URL selects the dictionary. A language link navigates to the same page under the other UI route. Browser language and saved preferences do not override that URL.

Use x18n to add or translate UI keys and keep the two dictionaries complete. System links use `localizedHref` from `src/i18n/links.ts`. Language metadata is centralized in `src/i18n/locales.ts`; adding a language requires coordinated dictionary, route, x18n, sitemap, and test updates. A new dictionary file alone does not register a language.

Blog posts and authored About text remain in their original language. Shared page templates live in `src/templates/`, and About/Privacy/Terms bodies live in `src/content/pages/`. Read [the i18n spec](i18n-spec.md) before changing translation boundaries, supported languages, or route behavior.

## Dark mode

`src/config.ts`, `features.darkMode` (`true`/`false`). Dark styling uses the `dark:` Tailwind variant, toggled by a `dark` class on `<html>`.

## Forms

`src/config.ts`, `forms` object:

- `forms.web3formsKey` — access key from [web3forms.com](https://web3forms.com), used by `/contact`.
- `forms.newsletter.action` — your newsletter service's subscribe URL. The form posts a single `email` field to it and opens the result in a new tab.
- Until these are filled in, the forms render but do not submit.

## Analytics

`src/config.ts`, `analytics.provider` (`null`, `'plausible'`, `'ga4'`, or `'umami'`) and
`analytics.id` (the Plausible domain, the GA4 measurement id, or the Umami website id).

`analytics.host` points a self-hosted Plausible or Umami at your own origin, with no trailing slash
(`https://stats.example.com`). Leave it empty for the hosted service, and for GA4.

## Blog options

`src/config.ts`, `blog` object:

- `blog.postsPerPage` — pagination size.
- `blog.dropCap` — drop the first letter of a post two lines, in the accent color (browsers without `initial-letter` show a plain letter).

## SEO

`src/config.ts`, `seo` object:

- `seo.titleTemplate` — e.g. `'%s · Sionrbot-blog'`.
- `seo.twitterHandle`.
- `seo.jsonLd` — `{ type: 'Person' | 'Organization', name }`, used for structured data.
