# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Astro site (root)
- `npm run dev` — dev server at localhost:4321
- `npm run build` — production build to `./dist/`
- `npm run preview` — preview production build
- `astro check` — TypeScript/template diagnostics

### Timeline worker (`worker/`)
- `cd worker && npm run dev` — local wrangler dev server
- `cd worker && npm run deploy` — deploy to Cloudflare Workers
- `cd worker && npm run db:migrate` — apply schema locally
- `cd worker && npm run db:migrate:prod` — apply schema to production D1

No test suite exists.

## Architecture

This is a personal blog/site with two independent parts:

### 1. Astro static site (root)
Astro 6 with MDX. Three content collections defined in `src/content.config.ts`:
- **writing** (`src/content/writing/`) — blog posts with title, date, summary, tags, draft
- **notes** (`src/content/notes/`) — short-form entries with date, tags, draft (no title — rendered inline)
- **projects** (`src/content/projects/`) — portfolio entries with title, status (active/archived/wip), optional url/repo

Layouts: `Base.astro` (shell + nav + glow canvas effect) wraps everything; `Post.astro` extends it for writing/project detail pages.

The **Activity page** (`src/pages/activity.astro`) fetches from the timeline worker API via `src/lib/{github,spotify,health}.ts`. These lib modules read `TIMELINE_API_URL` and `TIMELINE_API_KEY` from env. The activity page merges all sources into a unified chronological timeline with collapsible listen runs.

### 2. Cloudflare Worker (`worker/`)
A single `worker/src/index.ts` file that:
- **Scheduled cron** (every 15 min): polls Spotify recently-played and GitHub public events, stores in D1
- **GET `/api/timeline`**: unified read API with `source`, `since`, `until`, `limit` query params
- **POST `/api/health`**: ingest endpoint for Apple Health events (pushed from iOS Shortcuts)

D1 schema in `worker/schema.sql` — three tables: `spotify_listens`, `github_events`, `health_events`, each deduped by unique key.

Worker secrets needed: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REFRESH_TOKEN`, `GITHUB_USERNAME`, `API_KEY`.

## Style notes

- Global CSS uses a dark theme ("afterhours minimal") with CSS custom properties defined in `src/styles/global.css`
- All visible text is lowercase (`text-transform: lowercase` on html)
- Fonts: Inter (sans), JetBrains Mono (mono) — Inter loaded from rsms.me CDN
- The glow canvas effect in `Base.astro` is a mouse-following light blob rendered at quarter resolution, togglable via localStorage
- Astro MCP server configured in `.mcp.json` for docs lookups
