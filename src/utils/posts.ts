import { getCollection, type CollectionEntry } from 'astro:content';
import { site } from '../../site.config';

export type Post = CollectionEntry<'posts'>;

/** 读取全部文章（开发环境保留草稿，生产构建过滤掉） */
export async function getAllPosts(): Promise<Post[]> {
  const posts = await getCollection('posts', ({ data }) => {
    return import.meta.env.DEV ? true : !data.draft;
  });
  return posts.sort((a, b) => {
    if (a.data.pinned !== b.data.pinned) return a.data.pinned ? -1 : 1;
    return b.data.published.getTime() - a.data.published.getTime();
  });
}

export function postUrl(post: Post): string {
  return `/posts/${post.id}/`;
}

export function postCover(post: Post): string {
  return post.data.cover || site.defaultCover;
}

/** 粗略阅读时长：中文 350 字/分钟 + 英文 220 词/分钟 */
export function readingTime(body: string): { minutes: number; words: number } {
  const text = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ');
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const words = (text.replace(/[\u4e00-\u9fff]/g, ' ').match(/[A-Za-z0-9][A-Za-z0-9'_-]*/g) || []).length;
  const minutes = Math.max(1, Math.round(cjk / 350 + words / 220));
  return { minutes, words: cjk + words };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 2026.11.24 */
export function formatDate(date: Date): string {
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

/** 2026 年 11 月 24 日 */
export function formatDateLong(date: Date): string {
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

/** 2026-11-24，用于 datetime 属性 */
export function dateISO(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function groupByYear(posts: Post[]): { year: string; posts: Post[] }[] {
  const map = new Map<string, Post[]>();
  for (const post of posts) {
    const year = String(post.data.published.getFullYear());
    if (!map.has(year)) map.set(year, []);
    map.get(year)!.push(post);
  }
  return [...map.entries()]
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([year, list]) => ({ year, posts: list }));
}

export function countBy(posts: Post[], key: 'tags' | 'category') {
  const map = new Map<string, number>();
  for (const post of posts) {
    const values: string[] = key === 'tags' ? post.data.tags : [post.data.category];
    for (const value of values) {
      map.set(value, (map.get(value) ?? 0) + 1);
    }
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-CN'));
}

/** 简单相关文章：同分类 + 共享标签打分 */
export function relatedPosts(all: Post[], current: Post, limit = 3): Post[] {
  return all
    .filter((p) => p.id !== current.id)
    .map((p) => {
      let score = 0;
      if (p.data.category === current.data.category) score += 2;
      for (const tag of p.data.tags) {
        if (current.data.tags.includes(tag)) score += 3;
      }
      return { post: p, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.post.data.published.getTime() - a.post.data.published.getTime())
    .slice(0, limit)
    .map((item) => item.post);
}

export function tagUrl(tag: string): string {
  return `/tags/${encodeURIComponent(tag)}/`;
}

export function categoryUrl(category: string): string {
  return `/categories/${encodeURIComponent(category)}/`;
}

export function totalWords(posts: Post[]): number {
  return posts.reduce((sum, post) => sum + readingTime(post.body ?? '').words, 0);
}
