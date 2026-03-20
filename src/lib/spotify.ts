const CLIENT_ID = import.meta.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = import.meta.env.SPOTIFY_CLIENT_SECRET;
const REFRESH_TOKEN = import.meta.env.SPOTIFY_REFRESH_TOKEN;

interface SpotifyTokenResponse {
  access_token: string;
}

interface SpotifyTrack {
  name: string;
  artists: { name: string }[];
  album: {
    name: string;
    images: { url: string; width: number }[];
  };
  external_urls: { spotify: string };
}

interface SpotifyRecentItem {
  track: SpotifyTrack;
  played_at: string;
}

export interface Listen {
  track: string;
  artist: string;
  album: string;
  albumArt: string;
  url: string;
  playedAt: Date;
}

async function getAccessToken(): Promise<string | null> {
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    console.error('[spotify] missing env vars:', { CLIENT_ID: !!CLIENT_ID, CLIENT_SECRET: !!CLIENT_SECRET, REFRESH_TOKEN: !!REFRESH_TOKEN });
    return null;
  }

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: REFRESH_TOKEN,
    }),
  });

  if (!res.ok) {
    console.error('[spotify] token error:', res.status, await res.text());
    return null;
  }
  const data = (await res.json()) as SpotifyTokenResponse;
  return data.access_token;
}

export async function getRecentListens(limit = 20): Promise<Listen[]> {
  const token = await getAccessToken();
  if (!token) return [];

  const res = await fetch(
    `https://api.spotify.com/v1/me/player/recently-played?limit=${limit}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!res.ok) {
    console.error('[spotify] api error:', res.status, await res.text());
    return [];
  }

  const data = (await res.json()) as { items: SpotifyRecentItem[] };

  return data.items.map((item) => ({
    track: item.track.name,
    artist: item.track.artists.map((a) => a.name).join(', '),
    album: item.track.album.name,
    albumArt: item.track.album.images.find((i) => i.width <= 300)?.url
      || item.track.album.images[0]?.url || '',
    url: item.track.external_urls.spotify,
    playedAt: new Date(item.played_at),
  }));
}
