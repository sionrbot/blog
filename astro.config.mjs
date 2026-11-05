// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import icon from 'astro-icon';
import { satteri } from '@astrojs/markdown-satteri';
import { tableScroll } from './src/utils/table-scroll.ts';
import { math } from './src/utils/math.ts';
import { astroLocales, defaultLocale } from './src/i18n/locales.ts';
import { canonicalPath, isErrorPage } from './src/i18n/paths.ts';
import { site } from './src/config.ts';

// GFM task-list checkboxes have no accessible name and fail Lighthouse's 'label' audit. Wrap the item in a <label>
const taskListLabels = {
  name: 'sionrbot-task-list-labels',
  element: {
    filter: ['li'],
    /** @param {any} node hast Element */
    visit(node) {
      const [first] = node.children;
      if (first?.type !== 'element' || first.tagName !== 'input') return;
      return {
        ...node,
        children: [{ type: 'element', tagName: 'label', properties: {}, children: node.children }],
      };
    },
  },
};

const deploymentUrl = new URL(process.env.SITE_URL ?? site.url);
const base = deploymentUrl.pathname.replace(/\/$/, '') || '/';

// https://astro.build/config
export default defineConfig({
  // SITE_URL overrides config.ts at build time for alternate deployments.
  site: deploymentUrl.origin,
  base,
  i18n: { locales: astroLocales, defaultLocale, routing: { prefixDefaultLocale: false } },
  markdown: {
    processor: satteri({
      features: { math: true },
      mdastPlugins: [math],
      hastPlugins: [taskListLabels, tableScroll],
    }),
    // Emit light and dark themes as CSS variables. Colors are applied at the end of global.css
    shikiConfig: { themes: { light: 'github-light', dark: 'github-dark' }, defaultColor: false },
  },
  integrations: [
    mdx(),
    sitemap({
      i18n: { defaultLocale: 'en', locales: { en: 'en', zh: 'zh-Hans' } },
      filter: (page) => !isErrorPage(new URL(page).pathname, base),
      // Index canonical pages while retaining the integration's alternate relationships.
      serialize: (item) => {
        const path = new URL(item.url).pathname;
        return canonicalPath(path, base) === path ? item : undefined;
      },
    }),
    icon(),
    {
      name: 'sionrbot-styleguide',
      hooks: {
        'astro:config:setup': ({ command, injectRoute }) => {
          if (command === 'dev')
            injectRoute({ pattern: '/styleguide', entrypoint: './src/pages/_styleguide.astro' });
        },
      },
    },
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
