import { defineConfig } from 'astro/config';
import netlify from '@astrojs/netlify';

export default defineConfig({
  site: 'https://thecaminoguide.com',
  output: 'static',
  adapter: netlify(),

  // i18n ready from day one — add 'it', 'de' later without restructuring
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
    routing: {
      prefixDefaultLocale: false,
    },
  },

  integrations: [],
});
