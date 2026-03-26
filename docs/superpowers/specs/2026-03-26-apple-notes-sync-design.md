# Apple Notes → D1 → Blog Notes Sync

## Context

The blog's notes section (`/notes`) currently reads from markdown files in `src/content/notes/`. The goal is to replace this with Apple Notes as the single source of truth — write a note on your phone, tap a Shortcut, and it appears on the blog after a rebuild.

This follows the existing pattern: health events are already pushed from iOS Shortcuts to the worker's `POST /api/health` endpoint and stored in D1.

## Architecture

```
Apple Notes (Blog folder)
    ↓ iOS Shortcut (manual tap)
POST /api/notes on timeline-worker
    ↓ upsert + soft-delete
D1 notes table
    ↓ GET /api/notes (or /api/timeline?source=notes)
Astro custom content loader (build-time fetch)
    ↓ same schema as today
/notes pages render unchanged
```

## Components

### 1. D1 Schema — `notes` table

```sql
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dedup_key TEXT UNIQUE NOT NULL,   -- creation timestamp (ISO) for dedup
  content TEXT NOT NULL,             -- note body with hashtags stripped
  raw_content TEXT NOT NULL,         -- original note body as received
  tags TEXT NOT NULL DEFAULT '[]',   -- JSON array of parsed hashtag strings
  draft INTEGER NOT NULL DEFAULT 0,  -- 1 if #draft tag present
  deleted INTEGER NOT NULL DEFAULT 0,-- soft delete for removal sync
  created_at TEXT NOT NULL,          -- note creation date from Apple Notes
  updated_at TEXT NOT NULL,          -- note modification date from Apple Notes
  synced_at TEXT NOT NULL            -- when the worker received this note
);

CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_deleted ON notes(deleted);
```

### 2. Worker Endpoint — `POST /api/notes`

**Auth**: Same `API_KEY` header check as `POST /api/health`.

**Request body**:
```json
{
  "notes": [
    {
      "body": "plain text with #hashtags from apple notes",
      "created": "2026-03-26T10:30:00Z",
      "modified": "2026-03-26T10:35:00Z"
    }
  ]
}
```

**Processing per note**:
1. Parse hashtags from body → `tags` array (e.g., `#design` → `["design"]`)
2. Strip hashtags from body → `content`
3. Detect `#draft` tag → set `draft = 1`, remove from tags array
4. Use `created` timestamp as `dedup_key`
5. Upsert: INSERT OR REPLACE based on `dedup_key`

**Deletion sync**:
- After upserting all received notes, mark any note in D1 whose `dedup_key` is NOT in the current batch as `deleted = 1`
- This means the Shortcut always sends the full set of notes from the folder
- Previously deleted notes that reappear get `deleted = 0`

**Response**: `{ "synced": 5, "deleted": 1 }`

### 3. Worker Endpoint — `GET /api/notes`

Returns all non-deleted, non-draft notes ordered by `created_at DESC`.

**Query params** (optional):
- `include_drafts=true` — include drafts (for preview)
- `limit=N` — limit results
- `since=ISO` — notes created after this date

**Response**:
```json
{
  "notes": [
    {
      "id": "2026-03-26T10:30:00Z",
      "content": "plain text with hashtags stripped",
      "tags": ["design"],
      "draft": false,
      "created_at": "2026-03-26T10:30:00Z",
      "updated_at": "2026-03-26T10:35:00Z"
    }
  ]
}
```

Also integrate into existing `GET /api/timeline?source=notes` for the activity page.

### 4. Astro Custom Content Loader

Replace the `glob` loader for the notes collection with a custom loader that fetches from the worker API at build time.

In `src/content.config.ts`:
```typescript
const notesLoader = {
  name: 'notes-api',
  async load({ store, logger }) {
    const url = `${import.meta.env.TIMELINE_API_URL}/api/notes`;
    const res = await fetch(url, {
      headers: { 'X-API-Key': import.meta.env.TIMELINE_API_KEY }
    });
    const { notes } = await res.json();

    for (const note of notes) {
      store.set({
        id: note.id,
        data: {
          date: new Date(note.created_at),
          tags: note.tags,
          draft: note.draft,
        },
        body: note.content,
      });
    }
  }
};

const notes = defineCollection({
  loader: notesLoader,
  schema: z.object({
    date: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});
```

The schema stays identical — all existing pages, components, and rendering logic work without changes.

### 5. iOS Shortcut — "Sync Blog Notes"

The Shortcut flow:
1. **Find All Notes** where Folder is "Blog"
2. **Repeat with Each** note:
   - Get Name (unused but available), Body (plain text), Creation Date, Modification Date
   - Add to a list as `{ body, created, modified }`
3. **Get Contents of URL** — POST to `https://<worker-url>/api/notes`
   - Header: `X-API-Key: <your key>`
   - Body: JSON `{ "notes": [the list] }`

This is a simple shortcut — ~5 actions. Can be added to home screen or widget.

### 6. Migration

1. Recreate the 9 existing markdown notes as Apple Notes in a "Blog" folder
2. Add appropriate `#hashtags` for existing tags
3. Run the sync Shortcut
4. Verify notes appear via `GET /api/notes`
5. Remove `src/content/notes/*.md` files
6. Update content loader in config

## Edge Cases

- **Duplicate creation timestamps**: Unlikely for manual notes, but if it happens, the second note overwrites the first. Could append a content hash suffix to the dedup_key if this becomes an issue.
- **Rich text**: Apple Notes Shortcuts gives plain text body. Any formatting (bold, lists) is stripped. This is fine for short-form notes.
- **Empty notes**: Skip notes with empty body after hashtag stripping.
- **Large batches**: D1 batch operations handle this efficiently (same pattern as Spotify/GitHub).

## Verification

1. Add the `notes` table to D1 (local + prod)
2. Deploy worker with new endpoints
3. POST a test batch to `/api/notes` → verify D1 contents
4. GET `/api/notes` → verify response format
5. Run `npm run build` → verify notes render on `/notes` page
6. Test deletion: remove a note from the POST batch → verify soft delete
7. Test draft: include a `#draft` tagged note → verify it's excluded from GET
