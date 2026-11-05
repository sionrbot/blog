import { defineConfig } from '@x18n/cli';

export default defineConfig({
  sourceLocale: 'en',
  locales: ['en', 'ko', 'hu'],
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
