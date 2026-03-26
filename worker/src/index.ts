interface Env {
  DB: D1Database;
  SPOTIFY_CLIENT_ID: string;
  SPOTIFY_CLIENT_SECRET: string;
  SPOTIFY_REFRESH_TOKEN: string;
  GITHUB_USERNAME: string;
  API_KEY?: string;
}

// ── Spotify ──────────────────────────────────────────────

interface SpotifyTrack {
  name: string;
  artists: { name: string }[];
  album: { name: string; images: { url: string; width: number }[] };
  external_urls: { spotify: string };
}

interface SpotifyRecentItem {
  track: SpotifyTrack;
  played_at: string;
}

async function getSpotifyToken(env: Env): Promise<string | null> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`)}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: env.SPOTIFY_REFRESH_TOKEN,
    }),
  });

  if (!res.ok) {
    console.error('[spotify] token error:', res.status, await res.text());
    return null;
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function fetchAndStoreSpotify(env: Env): Promise<void> {
  const token = await getSpotifyToken(env);
  if (!token) return;

  const res = await fetch(
    'https://api.spotify.com/v1/me/player/recently-played?limit=50',
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!res.ok) {
    console.error('[spotify] api error:', res.status, await res.text());
    return;
  }

  const data = (await res.json()) as { items: SpotifyRecentItem[] };
  const stmt = env.DB.prepare(
    'INSERT OR IGNORE INTO spotify_listens (played_at, track, artist, album, album_art, url) VALUES (?, ?, ?, ?, ?, ?)',
  );

  const batch = data.items.map((item) => {
    const albumArt =
      item.track.album.images.find((i) => i.width <= 300)?.url ||
      item.track.album.images[0]?.url ||
      '';
    return stmt.bind(
      item.played_at,
      item.track.name,
      item.track.artists.map((a) => a.name).join(', '),
      item.track.album.name,
      albumArt,
      item.track.external_urls.spotify,
    );
  });

  if (batch.length > 0) {
    await env.DB.batch(batch);
    console.log(`[spotify] stored ${batch.length} listens (deduped)`);
  }
}

// ── GitHub ────────────────────────────────────────────────

interface GitHubEvent {
  id: string;
  type: string;
  created_at: string;
  repo: { name: string };
  payload: {
    action?: string;
    ref?: string;
    ref_type?: string;
    commits?: { message: string }[];
    pull_request?: { title: string; html_url: string };
    issue?: { title: string; html_url: string };
  };
}

function summarizeEvent(
  event: GitHubEvent,
): { type: string; description: string; repo: string; url: string } | null {
  const repo = event.repo.name;
  const repoUrl = `https://github.com/${repo}`;

  switch (event.type) {
    case 'PushEvent': {
      const commits = event.payload.commits || [];
      const branch = event.payload.ref?.replace('refs/heads/', '') || 'unknown';
      let description: string;
      if (commits.length === 0) {
        description = `pushed to ${branch}`;
      } else if (commits.length === 1) {
        description = commits[0]?.message?.split('\n')[0] || `pushed to ${branch}`;
      } else {
        const msg = commits[0]?.message?.split('\n')[0] || '';
        description = `${commits.length} commits — ${msg}`;
      }
      return {
        type: 'push',
        description,
        repo,
        url: repoUrl,
      };
    }
    case 'PullRequestEvent': {
      const pr = event.payload.pull_request;
      return {
        type: 'pr',
        description: `${event.payload.action} pr: ${pr?.title}`,
        repo,
        url: pr?.html_url || repoUrl,
      };
    }
    case 'IssuesEvent': {
      const issue = event.payload.issue;
      return {
        type: 'issue',
        description: `${event.payload.action} issue: ${issue?.title}`,
        repo,
        url: issue?.html_url || repoUrl,
      };
    }
    case 'WatchEvent':
      return { type: 'star', description: `starred ${repo}`, repo, url: repoUrl };
    case 'CreateEvent':
      return {
        type: 'create',
        description: `created ${event.payload.ref_type}${event.payload.ref ? ` ${event.payload.ref}` : ''} in ${repo}`,
        repo,
        url: repoUrl,
      };
    default:
      return null;
  }
}

async function fetchAndStoreGitHub(env: Env): Promise<void> {
  const username = env.GITHUB_USERNAME || 'rhgrieve';
  const res = await fetch(
    `https://api.github.com/users/${username}/events/public?per_page=100`,
    { headers: { 'User-Agent': 'timeline-worker', Accept: 'application/vnd.github.v3+json' } },
  );

  if (!res.ok) {
    console.error('[github] api error:', res.status, await res.text());
    return;
  }

  const events = (await res.json()) as GitHubEvent[];
  const stmt = env.DB.prepare(
    'INSERT OR IGNORE INTO github_events (event_id, event_type, description, repo, url, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
  );

  const batch = events
    .map((event) => {
      const summary = summarizeEvent(event);
      if (!summary) return null;
      return stmt.bind(
        event.id,
        summary.type,
        summary.description,
        summary.repo,
        summary.url,
        event.created_at,
      );
    })
    .filter((s): s is D1PreparedStatement => s !== null);

  if (batch.length > 0) {
    await env.DB.batch(batch);
    console.log(`[github] stored ${batch.length} events (deduped)`);
  }
}

// ── API Handler ──────────────────────────────────────────

// ── Health Ingest ─────────────────────────────────────────

interface HealthPayload {
  events: {
    type: string;       // 'steps', 'workout', 'sleep', 'weight', etc.
    value?: number;
    unit?: string;       // 'steps', 'min', 'km', 'kg', etc.
    label: string;       // human-readable: "8,432 steps", "35 min run", etc.
    timestamp: string;   // ISO 8601
    dedup_key?: string;  // optional — defaults to type+timestamp
  }[];
}

async function handleHealthIngest(request: Request, env: Env): Promise<Response> {
  // require auth for writes
  if (env.API_KEY) {
    const auth = request.headers.get('Authorization');
    if (auth !== `Bearer ${env.API_KEY}`) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: corsHeaders(),
      });
    }
  }

  const payload = (await request.json()) as HealthPayload;
  if (!payload.events?.length) {
    return new Response(JSON.stringify({ error: 'no events' }), {
      status: 400,
      headers: corsHeaders(),
    });
  }

  const stmt = env.DB.prepare(
    'INSERT OR IGNORE INTO health_events (event_type, value, unit, label, timestamp, dedup_key) VALUES (?, ?, ?, ?, ?, ?)',
  );

  const batch = payload.events.map((e) => {
    const key = e.dedup_key || `${e.type}:${e.timestamp}`;
    const label = e.label || [e.value, e.unit].filter(Boolean).join(' ') || e.type;
    return stmt.bind(e.type, e.value ?? null, e.unit ?? null, label, e.timestamp, key);
  });

  await env.DB.batch(batch);

  return new Response(JSON.stringify({ stored: batch.length }), {
    headers: corsHeaders(),
  });
}

// ── API Handler ──────────────────────────────────────────

function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Content-Type': 'application/json',
  };
}

// ── Heart Reactions (OpenHeart Protocol) ─────────────────

function parseEmoji(raw: string): string | null {
  const trimmed = raw.trim().replace(/=+$/, '');
  if (!trimmed) return null;
  const segments = Array.from(
    new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(trimmed),
  );
  const first = segments.length > 0 ? segments[0].segment : null;
  if (first && /\p{Emoji}/u.test(first)) return first;
  return null;
}

async function handleHeartPost(slug: string, request: Request, env: Env): Promise<Response> {
  const body = await request.text();
  const emoji = parseEmoji(body);
  if (!emoji) {
    return new Response(JSON.stringify({ error: 'invalid emoji' }), {
      status: 400,
      headers: corsHeaders(),
    });
  }

  await env.DB.prepare(
    'INSERT INTO reactions (slug, emoji, count) VALUES (?, ?, 1) ON CONFLICT(slug, emoji) DO UPDATE SET count = count + 1',
  ).bind(slug, emoji).run();

  return new Response('ok', { headers: corsHeaders() });
}

async function handleHeartGet(slug: string, env: Env): Promise<Response> {
  const rows = await env.DB.prepare(
    'SELECT emoji, count FROM reactions WHERE slug = ?',
  ).bind(slug).all();

  const result: Record<string, number> = {};
  for (const row of rows.results) {
    result[row.emoji as string] = row.count as number;
  }

  return new Response(JSON.stringify(result), { headers: corsHeaders() });
}

async function handleApi(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }

  // optional auth
  if (env.API_KEY) {
    const auth = request.headers.get('Authorization');
    if (auth !== `Bearer ${env.API_KEY}`) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: corsHeaders(),
      });
    }
  }

  const url = new URL(request.url);
  const source = url.searchParams.get('source'); // 'spotify' | 'github' | 'health' | null (all)
  const since = url.searchParams.get('since'); // ISO date
  const until = url.searchParams.get('until'); // ISO date
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '200', 10), 1000);

  const items: {
    source: string;
    timestamp: string;
    data: Record<string, string>;
  }[] = [];

  if (!source || source === 'spotify') {
    let q = 'SELECT played_at, track, artist, album, album_art, url FROM spotify_listens WHERE 1=1';
    const params: string[] = [];
    if (since) { q += ' AND played_at >= ?'; params.push(since); }
    if (until) { q += ' AND played_at < ?'; params.push(until); }
    q += ' ORDER BY played_at DESC LIMIT ?';
    params.push(String(limit));

    const rows = await env.DB.prepare(q).bind(...params).all();
    for (const row of rows.results) {
      items.push({
        source: 'spotify',
        timestamp: row.played_at as string,
        data: {
          track: row.track as string,
          artist: row.artist as string,
          album: row.album as string,
          albumArt: row.album_art as string,
          url: row.url as string,
        },
      });
    }
  }

  if (!source || source === 'github') {
    let q = 'SELECT event_type, description, repo, url, timestamp FROM github_events WHERE 1=1';
    const params: string[] = [];
    if (since) { q += ' AND timestamp >= ?'; params.push(since); }
    if (until) { q += ' AND timestamp < ?'; params.push(until); }
    q += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(String(limit));

    const rows = await env.DB.prepare(q).bind(...params).all();
    for (const row of rows.results) {
      items.push({
        source: 'github',
        timestamp: row.timestamp as string,
        data: {
          type: row.event_type as string,
          description: row.description as string,
          repo: row.repo as string,
          url: row.url as string,
        },
      });
    }
  }

  if (!source || source === 'health') {
    let q = 'SELECT event_type, value, unit, label, timestamp FROM health_events WHERE 1=1';
    const params: string[] = [];
    if (since) { q += ' AND timestamp >= ?'; params.push(since); }
    if (until) { q += ' AND timestamp < ?'; params.push(until); }
    q += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(String(limit));

    const rows = await env.DB.prepare(q).bind(...params).all();
    for (const row of rows.results) {
      items.push({
        source: 'health',
        timestamp: row.timestamp as string,
        data: {
          type: row.event_type as string,
          value: String(row.value ?? ''),
          unit: row.unit as string || '',
          label: row.label as string,
        },
      });
    }
  }

  // sort merged results by timestamp descending
  items.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return new Response(JSON.stringify({ items: items.slice(0, limit) }), {
    headers: corsHeaders(),
  });
}

// ── Worker Export ─────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/timeline') {
      return handleApi(request, env);
    }
    if (url.pathname === '/api/health' && request.method === 'POST') {
      return handleHealthIngest(request, env);
    }
    if (url.pathname === '/api/health' && request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    // OpenHeart reactions: /api/heart/<slug>
    if (url.pathname.startsWith('/api/heart/')) {
      const slug = url.pathname.slice('/api/heart/'.length);
      if (!slug) return new Response('not found', { status: 404 });

      if (request.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders() });
      }
      if (request.method === 'POST') {
        return handleHeartPost(slug, request, env);
      }
      if (request.method === 'GET') {
        return handleHeartGet(slug, env);
      }
      return new Response('method not allowed', { status: 405 });
    }

    return new Response('not found', { status: 404 });
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      Promise.all([fetchAndStoreSpotify(env), fetchAndStoreGitHub(env)]),
    );
  },
};
