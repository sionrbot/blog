import { defineConfig } from 'cf/config';

export default defineConfig({
  worker: {
    name: 'sionrbot-blog',
    compatibilityDate: '2026-11-05',
    workersDev: true,
    assets: {
      htmlHandling: 'auto-trailing-slash',
      notFoundHandling: '404-page',
    },
  },
});
