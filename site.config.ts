/**
 * 站点配置中心 —— 想改博客的名字、简介、导航、社交链接，基本都在这里。
 * 修改后重新 `npm run dev` 或 `npm run build` 即可生效。
 */

export interface NavItem {
  label: string;
  href: string;
  /** 图标名，见 src/components/Icon.astro 内置列表 */
  icon?: string;
}

export interface SocialItem {
  label: string;
  href: string;
  icon: string;
}

export const site = {
  /** 站点上线地址，必须与实际部署地址一致（影响 RSS / sitemap / OG） */
  url: 'https://xml152.github.io',
  /** 站点短名，用于标题后缀与 Logo */
  title: '逊懵泷',
  /** 首页大标题 */
  heading: '逊懵泷的博客',
  /** 一句话副标题，会出现在首页与 SEO 描述里 */
  description: '写代码，看动画，记录一些认真想过的事。',
  lang: 'zh-CN',
  /** 全站默认封面，文章没写 cover 时使用 */
  defaultCover: '/covers/aurora.jpg',
  /** 社交分享用的默认 OG 图（1200×630） */
  ogImage: '/og-default.png',

  author: {
    name: '逊懵泷',
    /** 头像放 public/ 目录下，或换成自己的图片地址 */
    avatar: '/avatar.jpg',
    /** 侧栏与关于页的一句话介绍 */
    bio: '嵌入式 / Linux / 看番、玩游戏，什么都碰一点点。',
    location: 'Hangzhou, China',
    email: 'long123741@outlook.com',
    github: 'https://github.com/xml152',
  },

  nav: [
    { label: '首页', href: '/', icon: 'home' },
    { label: '归档', href: '/archive/', icon: 'archive' },
    { label: '标签', href: '/tags/', icon: 'tag' },
    { label: '分类', href: '/categories/', icon: 'folder' },
    { label: '关于', href: '/about/', icon: 'user' },
  ] as NavItem[],

  socials: [
    { label: 'GitHub', href: 'https://github.com/xml152', icon: 'github' },
    { label: 'RSS', href: '/rss.xml', icon: 'rss' },
    { label: 'Mail', href: 'mailto:hello@example.com', icon: 'mail' },
  ] as SocialItem[],

  footer: {
    /** 版权起始年份 */
    since: 2026,
    /** 内容协议，留空则不展示 */
    license: 'CC BY-NC-SA 4.0',
    /** 备案号，留空则不展示 */
    icp: '',
    /** 页脚署名，留空则不展示 */
    credit: '本站模板由 DeepSeek 生成',
  },

  /** 每页文章数 */
  postsPerPage: 8,

  /** 文章目录（TOC）抓取的标题层级 */
  tocDepth: { min: 2, max: 3 },

  /** 首页侧栏「最近更新」条数 */
  recentCount: 5,
};

export type Site = typeof site;
