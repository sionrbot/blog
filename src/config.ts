// src/config.ts — single entry point for site settings. Every site-specific value lives here; never hardcode them in components.
import type en from './i18n/en';
import { defaultLocale } from './i18n/locales';
import defaultOgImage from './assets/og-default.png';

export const site = {
  name: 'Sionrbot-blog',
  description: "sionrbot's the first Astro theme blog.",
  url: 'https://blog.sionrbot.xyz',
  locale: defaultLocale, // URL selects the UI language; registry lives in src/i18n/locales.ts
  author: 'sionrbot', // Site author, also used in SEO structured data
  defaultOgImage, // 1200×630. A post's heroImage takes precedence
} as const;

export const nav = (t: typeof en) =>
  ({
    header: [
      { label: t.blog, href: '/blog' },
      { label: t.about, href: '/about' },
      { label: t.contact, href: '/contact' },
    ],
    footer: [
      {
        title: t.legal,
        links: [
          { label: t.privacy, href: '/privacy' },
          { label: t.terms, href: '/terms' },
        ],
      },
    ],
    social: [
      { label: 'GitHub', href: 'https://github.com/', icon: 'lucide:github' },
      // Icons are Lucide names (https://lucide.dev/icons), e.g. { label: 'Mastodon', href: '…', icon: 'lucide:at-sign' }
    ],
  }) as const;

export const seo = {
  titleTemplate: `%s · ${site.name}`,
  twitterHandle: '',
  jsonLd: { type: 'Person' as 'Person' | 'Organization', name: site.author },
};

export const blog = {
  postsPerPage: 10,
  dropCap: true, // Drop the first letter of a post two lines, in the accent color
};

export const features = {
  darkMode: true,
};

// Forms post to static-friendly services. With an empty value the form still renders but won't submit.
export const forms = {
  web3formsKey: '', // /contact — access key from https://web3forms.com
  newsletter: {
    action: '', // subscribe URL that accepts a single `email` field
  },
};

export const analytics = {
  provider: null as null | 'plausible' | 'ga4' | 'umami',
  id: '',
  // Self-hosted Plausible or Umami: the origin serving the script, no trailing slash.
  // Empty means the hosted service. GA4 ignores it.
  host: '',
};
