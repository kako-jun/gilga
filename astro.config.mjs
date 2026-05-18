import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwind from '@astrojs/tailwind';

export default defineConfig({
  site: process.env.SITE_URL || 'https://gilga.llll-ll.com',
  trailingSlash: 'ignore',
  integrations: [sitemap(), tailwind()],
  build: {
    assets: '_assets',
  },
  i18n: {
    defaultLocale: 'ja',
    locales: ['ja', 'en'],
    routing: {
      prefixDefaultLocale: true,
    },
  },
  redirects: {
    '/': '/ja/',
  },
  vite: {
    server: {
      proxy: {
        '/api': 'http://localhost:8787',
      },
    },
  },
});
