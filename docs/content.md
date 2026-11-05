# Content

Blog collection content lives under `src/content/blog/` and is defined in `src/content.config.ts`. Shared standalone page bodies live under `src/content/pages/`. Files are Markdown (`.md`) or MDX (`.mdx`) with a frontmatter block. Do not delete a schema field; new fields should be optional.

Images go in `src/assets/`, not `public/` (except favicon/robots). Reference `heroImage` with a path relative to the content file, and it is processed through `astro:assets`.

## blog

Files: `src/content/blog/<slug>.mdx`. Each file generates `/blog/<slug>/` for English UI and `/zh/blog/<slug>/` for Simplified Chinese UI. Both routes render the same original article. The URL chooses the UI language; it does not choose a translation of the article.

Fields:

- `title` (string, required)
- `description` (string, required, max 160 characters)
- `pubDate` (date, required)
- `updatedDate` (date, optional)
- `lang` (string, optional, default `en`) — a valid BCP 47 language tag for the original content, for example `en`, `zh-Hans`, or `ja`. It is independent of the supported UI languages. The existing articles were checked and marked `en`; new articles should state their actual language.
- `heroImage` (image, optional) — relative path from the post to a file in `src/assets/`, e.g. `../../assets/cover.jpg`
- `heroAlt` (string, required if `heroImage` is set)
- `tags` (string array, default `[]`)
- `draft` (boolean, default `false`) — `true` excludes the post from the production build

Example:

```md
---
title: On the pleasure of slow reading
description: A short case for reading fewer books, more carefully.
pubDate: 2026-03-02
lang: en
tags: [reading]
---
```

## Standalone pages and UI

About, Privacy, and Terms bodies are maintained once in `src/content/pages/`. Shared templates in `src/templates/` render these bodies through thin route entries in `src/pages/` and `src/pages/zh/`. Their original English descriptions and prose remain English while the page titles and surrounding controls follow the UI language.

Home content and section order live in `src/templates/Home.astro`. UI messages live in `src/i18n/en.ts` and `src/i18n/zh-Hans.ts`. Article titles, descriptions, body text, tags, and image alt text remain in their original language. System navigation uses the language-aware link helper; links authored inside MDX retain their original destinations. See [the i18n spec](i18n-spec.md) for the full translation boundary and SEO rules.

## MDX features

- Footnotes, tables, and task lists (GFM) are supported out of the box.
- Code blocks are highlighted with Shiki in light and dark themes.
- Math in LaTeX: `$…$` inline, `$$…$$` on its own lines. It renders to HTML with KaTeX at build
  time, and only pages with math load the KaTeX stylesheet. Two dollar signs in one paragraph
  (`$20 and $30`) read as a formula between them; write `\$` for a literal dollar sign.
  Chemical equations use mhchem: `$\ce{2H2 + O2 -> 2H2O}$`.
- Every post is attributed to `site.author` in `src/config.ts`.
- Section components can be embedded in the body of a post or page. See [Section components in a
  post](customization.md#section-components-in-a-post).
