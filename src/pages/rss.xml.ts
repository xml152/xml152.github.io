import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import { getAllPosts } from '../utils/posts';
import { site } from '../../site.config';

export const GET: APIRoute = async (context) => {
  const posts = await getAllPosts();

  return rss({
    title: site.heading,
    description: site.description,
    site: context.site ?? new URL(site.url),
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.published,
      link: `/posts/${post.id}/`,
      categories: [post.data.category, ...post.data.tags],
    })),
    customData: `<language>${site.lang}</language><copyright>© ${new Date().getFullYear()} ${site.author.name}</copyright>`,
    trailingSlash: true,
  });
};
