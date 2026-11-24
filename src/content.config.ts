import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * 文章集合。
 * 在 src/content/posts/ 下新建 .md 文件即可，支持子目录（目录名不会自动变成分类）。
 */
const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    /** 文章标题 */
    title: z.string().max(120),
    /** 摘要：列表卡片与 SEO 描述都会用到 */
    description: z.string().default(''),
    /** 发布日期，支持 2026-11-24 或 2026-11-24 10:00 */
    published: z.coerce.date(),
    /** 最后更新日期，可选 */
    updated: z.coerce.date().optional(),
    /** 分类：只有一个，作为主归档维度 */
    category: z.string().default('未分类'),
    /** 标签：可以有多个 */
    tags: z.array(z.string()).default([]),
    /** 封面图路径（public 下的绝对路径或外链），不填用站点默认封面 */
    cover: z.string().optional(),
    coverAlt: z.string().optional(),
    /** 草稿：生产构建时自动隐藏 */
    draft: z.boolean().default(false),
    /** 置顶：首页优先展示 */
    pinned: z.boolean().default(false),
    /** 文章语言，用于 <html lang> 与排版调整 */
    lang: z.string().default('zh-CN'),
  }),
});

export const collections = { posts };
