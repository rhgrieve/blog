# OpenHeart Reactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add anonymous heart reactions to writing and notes pages using the OpenHeart protocol, backed by the existing Cloudflare Worker + D1 database.

**Architecture:** New `reactions` table in D1, two new routes in the existing worker (`GET/POST /api/heart/*`), a custom `Heart.astro` component with client-side JS for fetching counts and posting reactions, placed on writing and notes detail pages. Notes frontmatter migrated from date to datetime for unique reaction slugs.

**Tech Stack:** Cloudflare Workers, D1 (SQLite), Astro 6, vanilla JS, CSS custom properties

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `worker/schema.sql` | Add `reactions` table |
| Modify | `worker/src/index.ts` | Add `GET/POST /api/heart/*` routes + handler |
| Create | `src/components/Heart.astro` | Heart reaction button component (markup, styles, client JS) |
| Modify | `src/layouts/Post.astro` | Import and render Heart component for writing posts |
| Modify | `src/pages/notes/[...slug].astro` | Import and render Heart component for notes |
| Modify | `src/content/notes/*.md` (9 files) | Update `date` frontmatter from date to datetime |

---

### Task 1: Add reactions table to D1 schema

**Files:**
- Modify: `worker/schema.sql:35` (append after health_events table)

- [ ] **Step 1: Add reactions table DDL**

Append to the end of `worker/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  emoji TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(slug, emoji)
);

CREATE INDEX IF NOT EXISTS idx_reactions_slug ON reactions(slug);
```

- [ ] **Step 2: Run local migration**

Run: `cd worker && npm run db:migrate`
Expected: Tables created successfully (no errors).

- [ ] **Step 3: Commit**

```bash
git add worker/schema.sql
git commit -m "schema: add reactions table for OpenHeart protocol"
```

---

### Task 2: Add heart API routes to the worker

**Files:**
- Modify: `worker/src/index.ts:1-8` (add to Env interface — no change needed, DB binding already exists)
- Modify: `worker/src/index.ts:250-259` (after corsHeaders function, add heart handler)
- Modify: `worker/src/index.ts:369-389` (add routes in fetch handler)

- [ ] **Step 1: Add emoji validation helper**

Add this function after the `corsHeaders()` function (after line 259 in `worker/src/index.ts`):

```typescript
// ── Heart Reactions (OpenHeart Protocol) ─────────────────

function parseEmoji(raw: string): string | null {
  const trimmed = raw.trim().replace(/=+$/, '');
  if (!trimmed) return null;
  const segments = Array.from(
    new Intl.Segmenter({ granularity: 'grapheme' }).segment(trimmed),
  );
  const first = segments.length > 0 ? segments[0].segment : null;
  if (first && /\p{Emoji}/u.test(first)) return first;
  return null;
}
```

- [ ] **Step 2: Add heart POST handler**

Add this function directly after `parseEmoji`:

```typescript
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
```

- [ ] **Step 3: Add heart GET handler**

Add this function directly after `handleHeartPost`:

```typescript
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
```

- [ ] **Step 4: Wire up routes in the fetch handler**

In the `fetch` handler (the `export default` block), add heart routes before the 404 fallback. Replace lines 369-389 with:

```typescript
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
```

- [ ] **Step 5: Verify worker compiles**

Run: `cd worker && npx wrangler dev --test-scheduled 2>&1 | head -20`
Expected: Worker starts without TypeScript errors. Kill it after verifying.

- [ ] **Step 6: Commit**

```bash
git add worker/src/index.ts
git commit -m "feat: add OpenHeart reaction API routes (GET/POST /api/heart/*)"
```

---

### Task 3: Create Heart.astro component

**Files:**
- Create: `src/components/Heart.astro`

This component receives a `slug` prop and renders a heart button with count. It uses client-side JS to fetch the count on load and post a reaction on click.

- [ ] **Step 1: Create the component**

Create `src/components/Heart.astro`:

```astro
---
interface Props {
  slug: string;
}

const { slug } = Astro.props;
const apiBase = import.meta.env.TIMELINE_API_URL || '';
const heartUrl = `${apiBase}/api/heart/${slug}`;
---

<div class="heart-reaction" data-heart-url={heartUrl}>
  <button class="heart-btn" aria-label="Send a heart reaction" type="button">
    <svg class="heart-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
    <span class="heart-count"></span>
  </button>
</div>

<style>
  .heart-reaction {
    margin-top: 3rem;
    padding-top: 1.5rem;
    border-top: 1px solid var(--border);
  }

  .heart-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    background: none;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.4rem 0.75rem;
    color: var(--text-dim);
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: 0.8rem;
    transition: color 0.15s, border-color 0.15s, transform 0.15s;
  }

  .heart-btn:hover:not([disabled]) {
    color: var(--text-bright);
    border-color: var(--text-dim);
  }

  .heart-btn:active:not([disabled]) {
    transform: scale(0.95);
  }

  .heart-btn[disabled] {
    cursor: default;
  }

  .heart-btn.reacted {
    color: #ff6b8a;
    border-color: #ff6b8a40;
  }

  .heart-btn.reacted .heart-icon {
    fill: #ff6b8a;
    stroke: #ff6b8a;
  }

  .heart-icon {
    transition: fill 0.2s, stroke 0.2s;
  }

  .heart-count:empty {
    display: none;
  }
</style>

<script>
  function initHeart() {
    document.querySelectorAll<HTMLDivElement>('.heart-reaction').forEach((el) => {
      const url = el.dataset.heartUrl;
      if (!url) return;

      const btn = el.querySelector<HTMLButtonElement>('.heart-btn')!;
      const countEl = el.querySelector<HTMLSpanElement>('.heart-count')!;
      const storageKey = '_open_heart';

      function getReacted(): Set<string> {
        const raw = localStorage.getItem(storageKey) || '';
        return new Set(raw.split(',').filter(Boolean));
      }

      function markReacted() {
        const set = getReacted();
        set.add(url!);
        localStorage.setItem(storageKey, Array.from(set).join(','));
        btn.classList.add('reacted');
        btn.disabled = true;
        btn.setAttribute('aria-pressed', 'true');
      }

      // check if already reacted
      if (getReacted().has(url)) {
        btn.classList.add('reacted');
        btn.disabled = true;
        btn.setAttribute('aria-pressed', 'true');
      }

      // fetch count
      fetch(url, { headers: { Accept: 'application/json' } })
        .then((r) => r.json())
        .then((data: Record<string, number>) => {
          const count = data['❤️'] || 0;
          countEl.textContent = count > 0 ? String(count) : '';
        })
        .catch(() => {});

      btn.addEventListener('click', () => {
        if (btn.disabled) return;

        // optimistic update
        const current = parseInt(countEl.textContent || '0', 10);
        countEl.textContent = String(current + 1);
        markReacted();

        fetch(url!, { method: 'POST', body: '❤️', mode: 'cors' }).catch(() => {
          // revert on failure
          countEl.textContent = current > 0 ? String(current) : '';
        });
      });
    });
  }

  initHeart();
  document.addEventListener('astro:after-swap', initHeart);
</script>
```

- [ ] **Step 2: Verify no syntax errors**

Run: `npx astro check 2>&1 | tail -20`
Expected: No errors related to `Heart.astro`.

- [ ] **Step 3: Commit**

```bash
git add src/components/Heart.astro
git commit -m "feat: add Heart reaction component"
```

---

### Task 4: Add Heart component to writing pages

**Files:**
- Modify: `src/layouts/Post.astro:1-14` (add import)
- Modify: `src/layouts/Post.astro:35-44` (add Heart after e-content, before toc)

- [ ] **Step 1: Add import and slug prop**

In `src/layouts/Post.astro`, add the import and update the Props interface:

Add after line 2 (`import FormattedDate from '../components/FormattedDate.astro';`):
```typescript
import Heart from '../components/Heart.astro';
```

Update the Props interface to add `heartSlug`:
```typescript
interface Props {
  title: string;
  date: Date;
  summary?: string;
  tags?: string[];
  draft?: boolean;
  readingTime?: number;
  heartSlug?: string;
}
```

Update the destructuring on line 14:
```typescript
const { title, date, summary, tags = [], draft = false, readingTime, heartSlug } = Astro.props;
```

- [ ] **Step 2: Add Heart component to the template**

After the `e-content prose` div (line 37: `</div>`) and before the `<nav class="toc">` (line 38), add:

```astro
    {heartSlug && <Heart slug={heartSlug} />}
```

- [ ] **Step 3: Pass heartSlug from writing page**

In `src/pages/writing/[...slug].astro`, add the `heartSlug` prop to the Post component. Replace lines 20-29:

```astro
<Post
  title={entry.data.title}
  date={entry.data.date}
  summary={entry.data.summary}
  tags={entry.data.tags}
  draft={entry.data.draft}
  readingTime={readingTime}
  heartSlug={`writing/${entry.id}`}
>
  <Content />
</Post>
```

- [ ] **Step 4: Verify it builds**

Run: `npx astro check 2>&1 | tail -20`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/layouts/Post.astro src/pages/writing/[...slug].astro
git commit -m "feat: add heart reaction to writing posts"
```

---

### Task 5: Add Heart component to notes pages

**Files:**
- Modify: `src/pages/notes/[...slug].astro:4` (add import)
- Modify: `src/pages/notes/[...slug].astro:32-36` (add Heart after note body)

- [ ] **Step 1: Add import**

In `src/pages/notes/[...slug].astro`, add after line 5 (`import FormattedDate from '../../components/FormattedDate.astro';`):

```typescript
import Heart from '../../components/Heart.astro';
```

- [ ] **Step 2: Add Heart component to the template**

After the `e-content prose note-body` div (line 34: `</div>`) and before the hidden links, add:

```astro
    <Heart slug={`notes/${entry.data.date.getTime()}`} />
```

The full article block should now be:

```astro
<Base title="note" description="a note.">
  <article class="h-entry">
    <div class="note-meta mono">
      <FormattedDate date={entry.data.date} class="dt-published" />
      {entry.data.tags.length > 0 && (
        <span class="note-tags">
          {entry.data.tags.map((tag) => (
            <a class="note-tag p-category" href={`/tags/${tag}/`}>#{tag}</a>
          ))}
        </span>
      )}
    </div>
    {/* No p-name — absence makes this a note, not an article */}
    <div class="e-content prose note-body">
      <Content />
    </div>
    <Heart slug={`notes/${entry.data.date.getTime()}`} />
    <a class="u-url" href={`/notes/${entry.id}/`} hidden></a>
    <a class="u-author" href="/about" hidden></a>
  </article>
</Base>
```

- [ ] **Step 3: Verify it builds**

Run: `npx astro check 2>&1 | tail -20`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/notes/[...slug].astro
git commit -m "feat: add heart reaction to notes pages"
```

---

### Task 6: Migrate notes frontmatter to datetime

**Files:**
- Modify: All 9 files in `src/content/notes/`

- [ ] **Step 1: Update each note's date to datetime format**

Update the `date` field in each note's frontmatter to use ISO 8601 datetime. Since exact times are unknown for existing notes, use `T12:00:00` (noon). The files and their current dates:

`src/content/notes/on-defaults.md`:
```yaml
date: 2026-01-22T12:00:00
```

`src/content/notes/quiet-software.md` — read the file to find the current date, then update to `<date>T12:00:00`.

`src/content/notes/late-night-clarity.md` — same pattern.

`src/content/notes/plain-text-wins.md` — same pattern.

`src/content/notes/naming-things.md` — same pattern.

`src/content/notes/offline-first.md` — same pattern.

`src/content/notes/two-kinds-of-fast.md` — same pattern.

`src/content/notes/delete-more.md` — same pattern.

`src/content/notes/the-right-amount.md` — same pattern.

For each file: open it, find the `date:` line in frontmatter, append `T12:00:00` to the date value.

- [ ] **Step 2: Verify the site builds with datetime values**

Run: `npx astro check 2>&1 | tail -20`
Expected: No errors. The `z.coerce.date()` schema already accepts datetime strings.

- [ ] **Step 3: Commit**

```bash
git add src/content/notes/
git commit -m "chore: migrate notes frontmatter dates to datetime for unique reaction slugs"
```

---

### Task 7: End-to-end manual verification

- [ ] **Step 1: Start the worker dev server**

Run: `cd worker && npm run dev`
Expected: Worker starts on a local port (typically 8787).

- [ ] **Step 2: Test POST reaction**

In a separate terminal:
```bash
curl -d '❤️' -X POST 'http://localhost:8787/api/heart/writing/test-post'
```
Expected: Response body `ok`.

- [ ] **Step 3: Test GET reaction count**

```bash
curl 'http://localhost:8787/api/heart/writing/test-post'
```
Expected: `{"❤️":1}`

- [ ] **Step 4: Test invalid emoji**

```bash
curl -d 'not-an-emoji' -X POST 'http://localhost:8787/api/heart/writing/test-post'
```
Expected: 400 response with `{"error":"invalid emoji"}`.

- [ ] **Step 5: Start the Astro dev server**

Run: `npm run dev`
Expected: Site starts on localhost:4321.

- [ ] **Step 6: Visual check**

Open a writing post and a note in the browser. Verify:
- Heart button appears below content
- Count loads (will be 0 for real slugs)
- Clicking the heart fills it, increments count, disables the button
- Refreshing the page shows the heart as already reacted (localStorage)

- [ ] **Step 7: Deploy worker schema**

Run: `cd worker && npm run db:migrate:prod`
Expected: Reactions table created in production D1.
