# 个人博客改造方案

> 生成说明：本方案与配套模板由 **DeepSeek** 生成，站主在此基础上做二次调整。
>
> 目标仓库：`xml152/xml152.github.io`（GitHub Pages 用户站，根路径部署）
> 交付物：一套可直接写作、可长期维护的博客模板 + 本文档

---

## 一、现状与目标

**现状**：仓库只有一个 README，没有站点、没有构建流程。GitHub Pages 用户站的好处是地址固定为 `https://xml152.github.io`，不需要配置 `base`。

**目标拆成三句话**：

1. **写作成本最低**：新建一个 Markdown 文件就是一篇博客，不需要打开后台、不需要懂前端。
2. **阅读体验优先**：中文排版舒服、首屏快、手机上能读，动效只服务于阅读。
3. **长期可维护**：无数据库、无服务器、无第三方依赖锁定，内容永远是纯文本。

**判断标准**（也是验收标准）：

| 指标 | 目标 |
| --- | --- |
| 发一篇新文章的操作 | 新建 md → 本地预览 → git push |
| 构建耗时（50 篇量级） | < 5s |
| 首屏 JS（不含搜索索引） | < 10KB |
| Lighthouse Performance | ≥ 95 |
| 站点年成本 | 0 元 |

---

## 二、参考站点拆解

你给了三个参考，它们其实代表了三种不同取向。拆开看：

| 参考站 | 技术栈 | 值得借鉴的点 | 我认为要避免的点 |
| --- | --- | --- | --- |
| `hotcocoacanary.github.io` | Hexo + Butterfly | 居中双栏、侧栏头部/统计/标签云、玻璃质感、归档页信息密度 | 主题定制受限于上游，改样式要读主题源码 |
| `www.rainafter.cn` | Astro + Fuwari | Banner + 头像、封面卡片、字数与阅读时长、分类/标签 chips、RSS/sitemap | 依赖 Tailwind 与较多客户端脚本，二次定制门槛高 |
| `notes.yangzhitao.top` | VitePress | 顶部导航清晰、卡片式目录、条目组织性强 | 文档站布局，缺少博客的时间流和「人」的气息 |

**结论**：这套模板取三者的交集——

- 信息结构学 **Fuwari**：Hero 区、封面卡片、字数/时长、分类与标签；
- 视觉气质学 **Butterfly**：居中阅读列、右侧栏、玻璃卡片、柔和的渐变；
- 导航与归档学 **VitePress Notes**：一级导航干净、归档/索引页信息密度高；
- **但全部用 Astro 重写**，不 fork 任何主题，改样式只动一个 `tokens.css`。

视觉方向定为「**极光 / Aurora**」：暖白纸感底 + 青→紫的低饱和极光渐变，玻璃质感的卡片与细边框。暗色模式是深墨蓝底 + 提亮的极光。

---

## 三、信息架构

```
/                        首页：Hero + 文章流 + 侧栏（分页 /2 /3 …）
/posts/<slug>/           文章页：标题区 + 封面 + 正文 + 右侧目录 + 前后篇 + 相关
/archive/                归档：按年份分组的时间线
/tags/                   标签总览：按文章数排序的标签云
/tags/<tag>/             标签详情：文章卡片列表
/categories/             分类总览：卡片 + 计数 + 最近一篇
/categories/<category>/  分类详情：文章卡片列表
/about/                  关于：自我介绍、近况、技术栈、联系方式
/404.html                404
/rss.xml                 RSS 2.0
/sitemap-index.xml       站点地图（@astrojs/sitemap 生成）
/robots.txt              robots + sitemap 指向
```

**为什么是「分类 + 标签」双轨**：分类负责粗粒度（技术 / 生活 / 阅读，长期稳定，每个文章只能有一个）；标签负责细主题（Astro、终端、效率，可以多选，会增长）。两者都能归档，但读者心智不同——分类是「这个博客有什么栏目」，标签是「我想找某个具体话题」。

**分页策略**：每页 8 篇，由 `site.config.ts` 的 `postsPerPage` 控制。首页第 2 页起不再渲染 Hero，直接用列表 + 分页，减少重复内容。

**导航**：首页 / 归档 / 标签 / 分类 / 关于，搜索用独立按钮（`Ctrl/⌘ + K`），不占导航位。桌面端显示完整文字，移动端收进抽屉。

---

## 四、视觉与设计规范

### 4.1 设计关键词

`留白` · `纸感` · `极光渐变` · `玻璃卡片` · `细边框` · `克制动效`

### 4.2 色彩

所有颜色集中在 `src/styles/tokens.css`，亮暗两套。核心变量：

| 变量 | 亮色 | 暗色 | 用途 |
| --- | --- | --- | --- |
| `--bg` | `#fbfbf9` | `#0b0f14` | 页面底色（暖白，不刺眼） |
| `--surface` | `rgba(255,255,255,.72)` | `rgba(20,28,36,.66)` | 玻璃卡片 |
| `--text` | `#1b2129` | `#e7eef5` | 正文 |
| `--text-secondary` | `#4c5561` | `#a7b3c0` | 次级文字 |
| `--text-muted` | `#6a7482` | `#77828f` | 日期、注释 |
| `--accent` | `#0a7e8f` | `#5fd3e6` | 链接、强调、交互态 |
| `--violet` | `#6a5ae8` | `#a99bff` | 渐变辅色 |
| `--border` | `rgba(27,33,41,.09)` | `rgba(231,238,245,.09)` | 细边框 |

强调色只在**链接、当前导航、悬停边框、标签**上出现，不大面积铺色——这样封面图的色彩不会和 UI 打架。

极光渐变只出现在三个地方：Hero 背景、头像环、焦点/进度条。避免满屏发光。

### 4.3 字体与字号

不加载 Web Font（中文子集太大、首屏会闪），使用系统字体栈：

```
PingFang SC / HarmonyOS Sans SC / MiSans / Microsoft YaHei / system-ui
```

字号阶梯：

| 层级 | 字号 | 行高 | 字重 |
| --- | --- | --- | --- |
| Hero 标题 | `clamp(2.15rem, 1.35rem + 2.6vw, 3.25rem)` | 1.14 | 760 |
| 页面标题 | `clamp(1.95rem, 1.45rem + 2vw, 2.75rem)` | 1.2 | 740 |
| 文章标题 | `clamp(1.9rem, 1.35rem + 2.2vw, 2.7rem)` | 1.25 | 750 |
| 正文 | 16.5px | 1.92 | 400 |
| 列表/卡片正文 | 13.8–14.5px | 1.75 | 400 |
| 日期/注释 | 11.5–12.5px | — | 400（等宽） |

正文行高 1.92 是刻意的：中文方块字在 1.7 左右会显得挤，1.9 以上才接近纸书。代码和数字用等宽字体，日期统一 `2026.11.24` 格式，形成节奏。

### 4.4 间距、圆角、阴影

- 内容宽度：主栏 760px、阅读列 720px、侧栏 296px，最大容器 1120px。
- 圆角：卡片 18px、封面 13px、按钮/标签全圆、Hero 26px。
- 阴影：三级（xs/sm/md），只用于卡片悬停与弹层。暗色下阴影加深、降低不透明度。
- 间距节奏：区块间 40–48px，卡片内 20px，列表项 14px。

### 4.5 动效原则

1. 时长 ≤ 300ms，缓动统一 `cubic-bezier(.22,1,.36,1)`。
2. 只允许「位移 4–14px + 透明度」类动效，不做缩放弹跳。
3. Hero 极光 22s 缓慢漂移，是页面唯一的持续动画。
4. 全部尊重 `prefers-reduced-motion`。
5. 主题切换用 View Transitions 做一次交叉淡入（不支持时直接切换）。

---

## 五、技术方案

### 5.1 架构

```
Markdown (frontmatter)
   │  content collections + zod 校验
   ▼
Astro 构建（SSG）
   ├── 文章排序 / 分组 / 字数统计
   ├── 页面渲染（布局 + 组件）
   └── 输出 dist/（纯 HTML + CSS + 少量 JS）
   ▼
Pagefind 扫描 dist → 生成 /pagefind/ 静态搜索索引
   ▼
GitHub Actions 上传 artifact → GitHub Pages 发布
```

没有运行时服务端，没有数据库，没有 API。读者拿到的就是一个静态站点 + 一个可以在浏览器里跑的搜索索引。

### 5.2 为什么是 Astro

| 维度 | Astro | Hexo+Butterfly | Hugo | VitePress |
| --- | --- | --- | --- | --- |
| 默认 JS | 0 | 中 | 0 | 低 |
| 样式定制 | 完全自由（组件 + CSS） | 受主题约束 | 受模板约束 | 中等 |
| 内容校验 | zod schema，构建期报错 | 无 | 无 | 弱 |
| 学习成本 | 低（HTML/CSS + 少量 TS） | 低 | 中（Go template） | 低 |
| 适合场景 | 想要自有设计的博客 | 想开箱即用 | 超大量文章 | 文档站 |

关键理由：**要自己的设计，又不想被主题绑架**。Astro 的 `.astro` 组件就是「HTML + 顶部一段 TS」，不需要 React 基础；同时它天然输出静态 HTML，性能上限高。

### 5.3 数据模型

`src/content.config.ts` 用 zod 定义 frontmatter，字段错拼、类型错误会在构建时直接失败，而不是上线后出现空白卡片。

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `title` | string | — | 必填 |
| `description` | string | `''` | 卡片摘要 / SEO |
| `published` | date | — | 必填，决定排序 |
| `updated` | date? | — | 有则显示「更新于」 |
| `category` | string | `未分类` | 单选 |
| `tags` | string[] | `[]` | 多选 |
| `cover` | string? | 站点默认 | 封面 |
| `draft` | boolean | false | 生产构建隐藏 |
| `pinned` | boolean | false | 首页置顶 |

派生数据不落库：阅读时长、字数、标签计数、年份分组都在构建时从正文实时计算，避免「frontmatter 和正文不一致」。

### 5.4 搜索：为什么用 Pagefind

| 方案 | 成本 | 中文支持 | 运维 |
| --- | --- | --- | --- |
| Algolia DocSearch | 免费额度有限 | 好 | 需申请、有外部依赖 |
| 自建 JSON + Fuse.js | 0 | 需自己分词 | 索引随文章增长会变大 |
| **Pagefind** | **0** | **内置 CJK 支持** | **构建期生成，零运维** |

Pagefind 在 `astro build` 后扫描 `dist/*.html`，按语言切词（中文用 n-gram），生成压缩后的静态分片，前端按需加载。配置在 `pagefind.yml`：

- `root_selector: main`：只索引正文；
- `exclude_selectors`：排除 Hero、侧栏、分页、文末导航，避免「侧栏最新文章」污染搜索结果；
- `excerpt_length: 32`。

代价：**开发模式没有索引**。这是静态索引的必然结果，换来的是零成本、零延迟、零外部请求。

### 5.5 深色模式

1. `<head>` 里一段 `is:inline` 脚本，在首次绘制前读取 `localStorage` 或系统偏好，写入 `<html data-theme>`，避免闪白。
2. 所有颜色走 CSS 变量，`html[data-theme='dark']` 覆盖一套值。
3. 代码高亮使用 Shiki 双主题，暗色下通过 `--shiki-dark` 变量切换。
4. 切换动画使用 `document.startViewTransition`，不支持则降级为直接切换。

### 5.6 性能预算

| 项目 | 预算 | 实际（1 篇示例） |
| --- | --- | --- |
| CSS（gzip） | ≤ 15KB | ~9KB |
| JS（gzip，含搜索 UI） | ≤ 10KB | ~4KB |
| 外部字体请求 | 0 | 0 |
| 首屏请求数 | ≤ 6 | 4–5 |

优化手段：系统字体、CSS 内联关键部分（Astro 自动）、图片 `loading="lazy"`、无 hydration、prefetch 仅在悬停时预取。

### 5.7 SEO

- 每页独立 `title` / `description` / `canonical`；
- OpenGraph + Twitter Card + 1200×630 默认 OG 图（文章有封面则用封面）；
- 文章页输出 `BlogPosting` JSON-LD（标题、日期、作者、封面）；
- RSS 2.0（`/rss.xml`）与 sitemap（`/sitemap-index.xml`）；
- 404 页 `noindex`，并从 sitemap 与搜索索引中排除。

---

## 六、内容与运营

### 6.1 写作流程

```bash
npm run dev                       # 本地写作预览（热更新）
# 新建 src/content/posts/my-post.md，填 frontmatter，写正文
npm run build && npm run preview  # 发布前检查（含搜索索引）
git add . && git commit -m "post: my-post" && git push
```

初稿可以是零散笔记或语音转文字，交给 AI 整理成 [`docs/post-template.md`](post-template.md) 的格式后再落盘。

push 之后 GitHub Actions 自动构建，约 1 分钟上线。

### 6.2 URL 规范

- 文件名用**英文小写 + 连字符**：`build-a-blog-with-astro.md`；
- 中文标题不要直接做文件名（会被 URL 编码成很长的 `%E4%B8...`，分享出来很难看）；
- URL 一旦发布尽量不改，改了要加跳转（静态站可用 `meta refresh` 页面）。

### 6.3 标签体系建议

标签容易失控，建议控制在 **30 个以内**，分几个稳定维度：

- 技术栈：`Astro` `TypeScript` `Linux`
- 领域：`前端` `后端` `构建`
- 类型：`教程` `复盘` `读书`
- 生活/兴趣：`随笔` `城市` `二次元` `动画` `游戏`

同一概念只保留一种写法（不要同时出现 `JS` 和 `JavaScript`）。标签页按文章数排序，侧栏只显示前 14 个。

### 6.4 图片

- 放在 `public/images/YYYY/MM/`，Markdown 里用 `/images/...` 引用；
- 发布前压到 WebP，宽度 ≤ 1600px；
- 每张图都写 `alt`，这既是无障碍也是 SEO；
- 封面建议 1200×630 或 21:9，卡片会裁切显示。

---

## 七、上线与运维

### 首次上线

1. push 代码到 `main`；
2. 仓库 **Settings → Pages → Source** 选 **GitHub Actions**；
3. 等 Actions 跑完，访问 `https://xml152.github.io`。

### 自定义域名（可选）

1. `public/CNAME` 写入域名（如 `blog.example.com`）；
2. DNS 加一条 CNAME 指向 `xml152.github.io`；
3. Pages 设置里填域名并勾选 Enforce HTTPS；
4. 同步修改 `astro.config.mjs` 的 `site` 与 `site.config.ts` 的 `url`。

### 日常维护

- 依赖升级：每季度 `npm outdated` → 升级 Astro 小版本 → 本地 build 验证；
- 内容备份：所有文章都是仓库里的纯文本，clone 即备份；
- 回滚：`git revert` 后 Actions 自动重新部署，不需要手动处理服务器。

### 风险与应对

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| 文章数 > 500 后搜索索引变大 | 首次搜索稍慢 | Pagefind 支持分片懒加载；可限制索引字段 |
| GitHub Pages 国内访问波动 | 首屏变慢 | 可加 Cloudflare 代理或迁移到 Vercel（代码不用改） |
| Astro 大版本升级破坏 API | 构建失败 | 锁定小版本，升级前在分支验证 |
| 评论需要 GitHub 登录 | 部分读者不愿留言 | 用 Giscus 时提供邮件联系方式作为替代 |

---

## 八、迭代路线

**P0（本次已完成）**

- [x] Astro 工程 + 内容集合 + 类型校验
- [x] 首页 Hero / 文章卡片 / 侧栏 / 分页
- [x] 文章页：目录、阅读进度、代码复制、前后篇、相关推荐
- [x] 归档 / 标签 / 分类 / 关于 / 404
- [x] Pagefind 搜索（`Ctrl/⌘ + K`）
- [x] 深浅色切换、RSS、sitemap、JSON-LD、OG
- [x] GitHub Actions 自动部署

**P1（建议下一步）**

- [ ] Giscus 评论（需在仓库开启 Discussions）
- [ ] 图片灯箱（原生 `<dialog>`，约 30 行）
- [ ] 友链页 `/friends/` 与「开往」入口
- [ ] `now` 页面（最近在做什么，月更）
- [ ] 文章内目录在移动端折叠为悬浮按钮

**P2（内容多了再说）**

- [ ] 系列文章（`series` 字段 + 系列导航）
- [ ] 中英双语（按 `lang` 分组）
- [ ] 阅读统计（Umami / 自建，隐私友好）
- [ ] 邮件订阅（Buttondown / RSS to Email）

---

## 九、验收清单

- [ ] `npm run build` 无报错，`dist/` 中生成 `pagefind/`、`rss.xml`、`sitemap-index.xml`
- [ ] 首页、文章页、归档、标签、分类、关于、404 均可访问
- [ ] 搜索能命中中文标题与正文，`Esc` 可关闭，方向键可选择
- [ ] 暗色模式下刷新不闪白，代码块颜色正确
- [ ] 手机（375px）无横向滚动，导航抽屉可开合
- [ ] 文章目录随滚动高亮，点击可跳转
- [ ] RSS 可被阅读器订阅，OG 图可正常抓取
- [ ] push 后 Actions 成功，线上地址可访问

---

## 十、交付物清单

| 文件 | 作用 |
| --- | --- |
| `site.config.ts` | 改这里就能换成你的站点 |
| `src/content/posts/*.md` | 文章（含 1 篇示例，可直接替换） |
| `src/styles/tokens.css` | 配色 / 圆角 / 阴影 / 字体 |
| `src/styles/prose.css` | 正文排版与代码块 |
| `src/pages/*` | 所有路由 |
| `pagefind.yml` | 搜索索引范围 |
| `.github/workflows/deploy.yml` | 自动部署 |
| `README.md` | 使用说明 |

代码 MIT，示例文字 CC BY-NC-SA 4.0。
