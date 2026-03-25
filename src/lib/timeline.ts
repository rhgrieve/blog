/// <reference types="@cloudflare/workers-types" />

// ── Types ─────────────────────────────────────────────────

export interface SpotifyListen {
  track: string;
  artist: string;
  album: string;
  albumArt: string;
  url: string;
  playedAt: Date;
}

export interface GitHubEvent {
  type: 'push' | 'pr' | 'issue' | 'star' | 'create' | 'other';
  description: string;
  repo: string;
  url: string;
  timestamp: Date;
}

export interface HealthEvent {
  type: string;
  value: string;
  unit: string;
  label: string;
  timestamp: Date;
}

// ── D1 Binding ────────────────────────────────────────────

async function getDB(): Promise<D1Database | null> {
  // In dev mode, skip D1 and use the HTTP API fallback
  if (import.meta.env.DEV) return null;
  try {
    const { env } = await import('cloudflare:workers') as { env: { DB?: D1Database } };
    return env.DB ?? null;
  } catch {
    return null;
  }
}

// ── HTTP Fallback Helpers ─────────────────────────────────

const TIMELINE_API = import.meta.env.TIMELINE_API_URL;
const API_KEY = import.meta.env.TIMELINE_API_KEY;

interface APIItem {
  timestamp: string;
  data: Record<string, string>;
}

async function fetchFromAPI(source: string, limit: number): Promise<APIItem[]> {
  if (!TIMELINE_API) {
    console.error(`[timeline] TIMELINE_API_URL not set, cannot fetch ${source}`);
    return [];
  }

  const url = new URL('/api/timeline', TIMELINE_API);
  url.searchParams.set('source', source);
  url.searchParams.set('limit', String(limit));

  const headers: Record<string, string> = {};
  if (API_KEY) headers['Authorization'] = `Bearer ${API_KEY}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    console.error(`[timeline] ${source} api error:`, res.status, await res.text());
    return [];
  }

  const { items } = (await res.json()) as { items: APIItem[] };
  return items;
}

// ── Spotify ───────────────────────────────────────────────

export async function getRecentListens(limit = 200): Promise<SpotifyListen[]> {
  try {
    const db = await getDB();
    if (db) return await getListensFromD1(db, limit);
    return await getListensFromAPI(limit);
  } catch (err) {
    console.error('[timeline] spotify error:', err);
    return [];
  }
}

async function getListensFromD1(db: D1Database, limit: number): Promise<SpotifyListen[]> {
  const rows = await db
    .prepare('SELECT played_at, track, artist, album, album_art, url FROM spotify_listens ORDER BY played_at DESC LIMIT ?')
    .bind(limit)
    .all();

  return rows.results
    .map((row) => ({
      track: row.track as string,
      artist: row.artist as string,
      album: row.album as string,
      albumArt: row.album_art as string,
      url: row.url as string,
      playedAt: new Date(row.played_at as string),
    }))
    .filter((item) => !isNaN(item.playedAt.getTime()));
}

async function getListensFromAPI(limit: number): Promise<SpotifyListen[]> {
  const items = await fetchFromAPI('spotify', limit);
  return items
    .map((item) => ({
      track: item.data.track as string,
      artist: item.data.artist as string,
      album: item.data.album as string,
      albumArt: item.data.albumArt as string,
      url: item.data.url as string,
      playedAt: new Date(item.timestamp),
    }))
    .filter((item) => !isNaN(item.playedAt.getTime()));
}

// ── GitHub ────────────────────────────────────────────────

export async function getRecentGitHub(limit = 200): Promise<GitHubEvent[]> {
  try {
    const db = await getDB();
    if (db) return await getGitHubFromD1(db, limit);
    return await getGitHubFromAPI(limit);
  } catch (err) {
    console.error('[timeline] github error:', err);
    return [];
  }
}

async function getGitHubFromD1(db: D1Database, limit: number): Promise<GitHubEvent[]> {
  const rows = await db
    .prepare('SELECT event_type, description, repo, url, timestamp FROM github_events ORDER BY timestamp DESC LIMIT ?')
    .bind(limit)
    .all();

  return rows.results
    .map((row) => ({
      type: row.event_type as GitHubEvent['type'],
      description: row.description as string,
      repo: row.repo as string,
      url: row.url as string,
      timestamp: new Date(row.timestamp as string),
    }))
    .filter((item) => !isNaN(item.timestamp.getTime()));
}

async function getGitHubFromAPI(limit: number): Promise<GitHubEvent[]> {
  const items = await fetchFromAPI('github', limit);
  return items
    .map((item) => ({
      type: item.data.type as GitHubEvent['type'],
      description: item.data.description as string,
      repo: item.data.repo as string,
      url: item.data.url as string,
      timestamp: new Date(item.timestamp),
    }))
    .filter((item) => !isNaN(item.timestamp.getTime()));
}

// ── Health ────────────────────────────────────────────────

export async function getRecentHealth(limit = 200): Promise<HealthEvent[]> {
  try {
    const db = await getDB();
    if (db) return await getHealthFromD1(db, limit);
    return await getHealthFromAPI(limit);
  } catch (err) {
    console.error('[timeline] health error:', err);
    return [];
  }
}

async function getHealthFromD1(db: D1Database, limit: number): Promise<HealthEvent[]> {
  const rows = await db
    .prepare('SELECT event_type, value, unit, label, timestamp FROM health_events ORDER BY timestamp DESC LIMIT ?')
    .bind(limit)
    .all();

  return rows.results
    .map((row) => ({
      type: row.event_type as string,
      value: String(row.value ?? ''),
      unit: (row.unit as string) || '',
      label: row.label as string,
      timestamp: new Date(row.timestamp as string),
    }))
    .filter((item) => !isNaN(item.timestamp.getTime()));
}

async function getHealthFromAPI(limit: number): Promise<HealthEvent[]> {
  const items = await fetchFromAPI('health', limit);
  return items
    .map((item) => ({
      type: item.data.type as string,
      value: item.data.value as string,
      unit: item.data.unit as string,
      label: item.data.label as string,
      timestamp: new Date(item.timestamp),
    }))
    .filter((item) => !isNaN(item.timestamp.getTime()));
}
