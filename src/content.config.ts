import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import type { Loader } from 'astro/loaders';
import { z } from 'astro/zod';

const writing = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/writing' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    summary: z.string().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

async function getDB(): Promise<D1Database | null> {
  try {
    const { env } = await import('cloudflare:workers') as { env: { DB?: D1Database } };
    return env.DB ?? null;
  } catch {
    return null;
  }
}

const notesLoader = {
  name: 'notes-d1',
  async load({ store, logger, parseData }) {
    const db = await getDB();

    if (!db) {
      // Fallback to HTTP API for local dev
      const apiUrl = import.meta.env.TIMELINE_API_URL;
      const apiKey = import.meta.env.TIMELINE_API_KEY;

      if (!apiUrl) {
        logger.warn('No D1 binding or TIMELINE_API_URL available, skipping notes fetch');
        return;
      }

      try {
        const res = await fetch(`${apiUrl}/api/notes`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!res.ok) {
          logger.error(`Notes API returned ${res.status}`);
          return;
        }
        const { notes: apiNotes } = (await res.json()) as {
          notes: { id: string; content: string; tags: string[]; draft: boolean; created_at: string }[];
        };
        store.clear();
        for (const note of apiNotes) {
          const id = String(new Date(note.created_at).getTime());
          const data = await parseData({
            id,
            data: { date: new Date(note.created_at), tags: note.tags, draft: note.draft },
          });
          store.set({ id, data, rendered: { html: `<p>${note.content}</p>` } });
        }
        logger.info(`Loaded ${apiNotes.length} notes from API`);
      } catch (err) {
        logger.error(`Failed to fetch notes: ${err}`);
      }
      return;
    }

    // Direct D1 query
    try {
      const rows = await db.prepare(
        'SELECT dedup_key, content, tags, draft, created_at FROM notes WHERE deleted = 0 AND draft = 0 ORDER BY created_at DESC LIMIT 200'
      ).all();

      store.clear();

      for (const row of rows.results) {
        const id = String(new Date(row.created_at as string).getTime());
        const tags = JSON.parse(row.tags as string) as string[];
        const data = await parseData({
          id,
          data: {
            date: new Date(row.created_at as string),
            tags,
            draft: (row.draft as number) === 1,
          },
        });
        store.set({ id, data, rendered: { html: `<p>${row.content}</p>` } });
      }

      logger.info(`Loaded ${rows.results.length} notes from D1`);
    } catch (err) {
      logger.error(`Failed to fetch notes from D1: ${err}`);
    }
  },
} satisfies Loader;

const notes = defineCollection({
  loader: notesLoader,
  schema: z.object({
    date: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    summary: z.string().optional(),
    tags: z.array(z.string()).default([]),
    url: z.string().optional(),
    repo: z.string().optional(),
    status: z.enum(['active', 'archived', 'wip']).default('active'),
    draft: z.boolean().default(false),
  }),
});

export const collections = { writing, notes, projects };
