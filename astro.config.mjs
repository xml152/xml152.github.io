import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// 站点主配置：https://astro.build/config
export default defineConfig({
  // 自定义域名时改成你的域名，例如 https://blog.example.com
  site: 'https://xml152.github.io',
  trailingSlash: 'ignore',
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/search/'),
    }),
  ],
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
  },
  markdown: {
    // 亮/暗双主题代码高亮，跟随站点切换
    shikiConfig: {
      themes: {
        light: 'github-light',
        dark: 'github-dark-dimmed',
      },
      wrap: false,
    },
  },
  devToolbar: { enabled: false },
});
