# OpenHeart Reactions

Add anonymous emoji reactions to writing and notes pages using the [OpenHeart protocol](https://openheart.fyi/).

## Data layer

New `reactions` table in the existing D1 database:

```sql
CREATE TABLE reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  emoji TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(slug, emoji)
);
CREATE INDEX idx_reactions_slug ON reactions(slug);
```

- `slug` identifies the content: `writing/dotfiles-setup` or `notes/1737561000000`
- `emoji` is always `❤️` for now, but the schema supports future expansion
- `count` is an integer incremented on each POST
- UNIQUE constraint on `slug + emoji` prevents duplicate rows

## API routes

Added to the existing Cloudflare Worker in `worker/src/index.ts`, alongside the timeline API.

### POST /api/heart/\*

Receives a reaction for a content slug.

- Request body: a single emoji (e.g. `❤️`). Trailing characters are stripped (to support HTML form submissions where body becomes `❤️=`).
- Validates the emoji using `Intl.Segmenter` — rejects non-emoji with 400.
- Upserts the count: `INSERT INTO reactions ... ON CONFLICT(slug, emoji) DO UPDATE SET count = count + 1`.
- Returns 200 with body `ok`.
- CORS headers: same `Access-Control-Allow-Origin: *` pattern as existing routes.

### GET /api/heart/\*

Returns reaction counts for a content slug.

- Response: JSON object mapping emoji to count, e.g. `{"❤️": 12}`.
- If no reactions exist for the slug, returns `{}`.
- CORS headers included.

The slug is extracted from everything after `/api/heart/` in the URL path. This allows slashes in the slug (e.g. `writing/dotfiles-setup`).

## Frontend component

A custom Astro component (`src/components/Heart.astro`) — not the upstream `<open-heart>` web component, because we need custom styling that matches the site theme.

### Markup

A `<button>` containing an inline SVG heart icon and a count `<span>`. Placed below the article content on writing and notes detail pages.

### Behavior (client-side JS)

- **On load**: GET `/api/heart/{slug}`, parse the JSON, display the count for ❤️ next to the heart.
- **On click**: POST ❤️ to `/api/heart/{slug}`, optimistically increment the displayed count, fill/animate the heart, and persist the slug to `localStorage` to prevent repeat reactions.
- **Already reacted**: On mount, check `localStorage`. If the slug is present, render the heart in its "filled" state and disable clicking.

### Styling

- Heart icon: outline style by default, filled when clicked/already reacted.
- Matches the site's dark theme — uses CSS custom properties (`--text-dim`, `--accent`, etc.).
- Subtle transition/animation on click.
- Count displayed in mono font, dim color, next to the heart.

### Placement

- **Writing pages** (`src/pages/writing/[...slug].astro`): below the article content inside the `Post.astro` layout.
- **Notes pages** (`src/pages/notes/[...slug].astro`): below the note body.

## Notes datetime migration

The notes collection currently uses date-only values in frontmatter (`date: 2026-01-22`). To support multiple notes per day and provide unique reaction slugs:

### Schema change

The Zod schema in `src/content.config.ts` already uses `z.coerce.date()`, which accepts both date and datetime strings. No schema change needed.

### Frontmatter update

Update all existing note files to use datetime format:

- Before: `date: 2026-01-22`
- After: `date: 2026-01-22T12:00:00`

Existing notes get a noon timestamp since exact time is unknown.

### Reaction slug derivation

- Writing: `writing/${entry.id}` (e.g. `writing/dotfiles-setup`)
- Notes: `notes/${entry.data.date.getTime()}` (e.g. `notes/1737561600000`)

### Notes page routing

The notes detail page at `src/pages/notes/[...slug].astro` currently uses `entry.id` (filename stem) as the slug. This continues to work — the datetime is only used for the reaction key, not the URL.

## Migration

Add the `reactions` table to `worker/schema.sql` and run:

- `cd worker && npm run db:migrate` (local)
- `cd worker && npm run db:migrate:prod` (production)

## What we're NOT doing

- No authentication on reactions — anonymous by design per the OpenHeart protocol.
- No rate limiting beyond Cloudflare's built-in DDoS protection.
- No emoji picker — single heart only.
- No server-side allow list — we validate it's an emoji but only render ❤️ on the frontend.
- Not using the upstream `<open-heart>` web component — custom styling needed.
