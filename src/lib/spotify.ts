const TIMELINE_API = import.meta.env.TIMELINE_API_URL;
const API_KEY = import.meta.env.TIMELINE_API_KEY;

export interface Listen {
  track: string;
  artist: string;
  album: string;
  albumArt: string;
  url: string;
  playedAt: Date;
}

export async function getRecentListens(limit = 200): Promise<Listen[]> {
  if (!TIMELINE_API) {
    console.error('[spotify] TIMELINE_API_URL not set');
    return [];
  }

  const url = new URL('/api/timeline', TIMELINE_API);
  url.searchParams.set('source', 'spotify');
  url.searchParams.set('limit', String(limit));

  const headers: Record<string, string> = {};
  if (API_KEY) headers['Authorization'] = `Bearer ${API_KEY}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    console.error('[spotify] api error:', res.status, await res.text());
    return [];
  }

  const { items } = (await res.json()) as {
    items: { timestamp: string; data: { track: string; artist: string; album: string; albumArt: string; url: string } }[];
  };

  return items.map((item) => ({
    ...item.data,
    playedAt: new Date(item.timestamp),
  }));
}
