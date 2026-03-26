/// <reference types="@cloudflare/workers-types" />

async function getDB(): Promise<D1Database | null> {
  if (import.meta.env.DEV) return null;
  try {
    const { env } = (await import('cloudflare:workers')) as { env: { DB?: D1Database } };
    return env.DB ?? null;
  } catch {
    return null;
  }
}

function parseEmoji(raw: string): string | null {
  const trimmed = raw.trim().replace(/=+$/, '');
  if (!trimmed) return null;
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const segments = Array.from(segmenter.segment(trimmed));
  const first = segments.length > 0 ? segments[0].segment : null;
  if (first && /\p{Emoji}/u.test(first)) return first;
  return null;
}

export async function GET({ params }: { params: { slug: string } }) {
  const slug = params.slug;
  const db = await getDB();

  if (!db) {
    // Dev fallback: try the worker API
    const api = import.meta.env.TIMELINE_API_URL;
    if (!api) return new Response('{}', { headers: { 'Content-Type': 'application/json' } });
    const res = await fetch(`${api}/api/heart/${slug}`, { headers: { Accept: 'application/json' } });
    return new Response(await res.text(), { headers: { 'Content-Type': 'application/json' } });
  }

  const rows = await db
    .prepare('SELECT emoji, count FROM reactions WHERE slug = ?')
    .bind(slug)
    .all();

  const result: Record<string, number> = {};
  for (const row of rows.results) {
    result[row.emoji as string] = row.count as number;
  }

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST({ params, request }: { params: { slug: string }; request: Request }) {
  const slug = params.slug;
  const body = await request.text();
  const emoji = parseEmoji(body);

  if (!emoji) {
    return new Response(JSON.stringify({ error: 'invalid emoji' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const db = await getDB();

  if (!db) {
    // Dev fallback: try the worker API
    const api = import.meta.env.TIMELINE_API_URL;
    if (!api) return new Response('ok');
    const res = await fetch(`${api}/api/heart/${slug}`, { method: 'POST', body: emoji });
    return new Response(await res.text());
  }

  await db
    .prepare(
      'INSERT INTO reactions (slug, emoji, count) VALUES (?, ?, 1) ON CONFLICT(slug, emoji) DO UPDATE SET count = count + 1',
    )
    .bind(slug, emoji)
    .run();

  return new Response('ok');
}
