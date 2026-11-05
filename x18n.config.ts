import { defineConfig } from '@x18n/cli';
import { defaultLocale, supportedLocales } from './src/i18n/locales';

export default defineConfig({
  sourceLocale: defaultLocale,
  locales: [...supportedLocales],
  plugins: [
    {
      name: 'sionrbot-placeholders',
      placeholders: [
        {
          id: 'single-brace',
          example: '{name}',
          find: (value) =>
            [...value.matchAll(/\{(\w+)\}/g)].map((match) => ({
              name: match[1],
              text: match[0],
              syntax: 'single-brace',
              range: { start: match.index, end: match.index + match[0].length },
            })),
        },
      ],
    },
  ],
  presets: ['general'],
  resources: [
    {
      pattern: 'src/i18n/{locale}.ts',
    },
  ],
  usage: {
    include: ['src/**/*.astro', 'src/**/*.ts'],
    exclude: ['src/i18n/**'],
    // useT returns a dictionary; components read its properties rather than call t().
    regex: [
      {
        extensions: ['astro', 'ts'],
        patterns: ['(?<![\\w$.])t\\s*\\.\\s*([A-Za-z_$][\\w$]*)'],
      },
    ],
  },
});
