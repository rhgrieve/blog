import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const writing = await getCollection('writing');
  const notes = await getCollection('notes');

  const writingItems = writing
    .filter((e) => !e.data.draft)
    .map((entry) => ({
      title: entry.data.title,
      pubDate: entry.data.date,
      description: entry.data.summary || '',
      link: `/writing/${entry.id}/`,
    }));

  const noteItems = notes
    .filter((e) => !e.data.draft)
    .map((entry) => ({
      title: entry.data.title,
      pubDate: entry.data.date,
      description: '',
      link: `/notes/${entry.id}/`,
    }));

  const items = [...writingItems, ...noteItems]
    .sort((a, b) => b.pubDate.valueOf() - a.pubDate.valueOf());

  return rss({
    title: 'rhg',
    description: 'Personal site.',
    site: context.site!,
    items,
  });
}
