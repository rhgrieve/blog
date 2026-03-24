const TIMELINE_API = import.meta.env.TIMELINE_API_URL;
const API_KEY = import.meta.env.TIMELINE_API_KEY;

export interface HealthEvent {
  type: string;
  value: string;
  unit: string;
  label: string;
  timestamp: Date;
}

export async function getRecentHealth(limit = 200): Promise<HealthEvent[]> {
  if (!TIMELINE_API) return [];

  const url = new URL('/api/timeline', TIMELINE_API);
  url.searchParams.set('source', 'health');
  url.searchParams.set('limit', String(limit));

  const headers: Record<string, string> = {};
  if (API_KEY) headers['Authorization'] = `Bearer ${API_KEY}`;

  const res = await fetch(url, { headers });
  if (!res.ok) return [];

  const { items } = (await res.json()) as {
    items: { timestamp: string; data: { type: string; value: string; unit: string; label: string } }[];
  };

  return items
    .map((item) => ({
      ...item.data,
      timestamp: new Date(item.timestamp),
    }))
    .filter((item) => !isNaN(item.timestamp.getTime()));
}
