// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://example.com',
  integrations: [mdx()],

  markdown: {
    shikiConfig: {
      theme: 'github-dark-default',
    },
  },

  adapter: cloudflare(),
});