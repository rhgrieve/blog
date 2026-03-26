CREATE TABLE IF NOT EXISTS spotify_listens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  played_at TEXT NOT NULL UNIQUE,
  track TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT NOT NULL,
  album_art TEXT,
  url TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_spotify_played_at ON spotify_listens(played_at DESC);

CREATE TABLE IF NOT EXISTS github_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  description TEXT NOT NULL,
  repo TEXT NOT NULL,
  url TEXT NOT NULL,
  timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_github_timestamp ON github_events(timestamp DESC);

CREATE TABLE IF NOT EXISTS health_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  value REAL,
  unit TEXT,
  label TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  dedup_key TEXT NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_health_timestamp ON health_events(timestamp DESC);

CREATE TABLE IF NOT EXISTS reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  emoji TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(slug, emoji)
);

CREATE INDEX IF NOT EXISTS idx_reactions_slug ON reactions(slug);
