const TIMELINE_API = import.meta.env.TIMELINE_API_URL;
const API_KEY = import.meta.env.TIMELINE_API_KEY;

export interface GitHubActivity {
  type: 'push' | 'pr' | 'issue' | 'star' | 'create' | 'other';
  description: string;
  repo: string;
  url: string;
  timestamp: Date;
}

export async function getRecentActivity(limit = 200): Promise<GitHubActivity[]> {
  if (!TIMELINE_API) {
    console.error('[github] TIMELINE_API_URL not set');
    return [];
  }

  const url = new URL('/api/timeline', TIMELINE_API);
  url.searchParams.set('source', 'github');
  url.searchParams.set('limit', String(limit));

  const headers: Record<string, string> = {};
  if (API_KEY) headers['Authorization'] = `Bearer ${API_KEY}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    console.error('[github] api error:', res.status, await res.text());
    return [];
  }

  const { items } = (await res.json()) as {
    items: { timestamp: string; data: { type: string; description: string; repo: string; url: string } }[];
  };

  return items.map((item) => ({
    type: item.data.type as GitHubActivity['type'],
    description: item.data.description,
    repo: item.data.repo,
    url: item.data.url,
    timestamp: new Date(item.timestamp),
  }));
}
