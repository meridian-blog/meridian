# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this
repository.

## Project Overview

Meridian Blog Engine - a self-hosted, zero-platform-fee publishing platform (Ghost model). Built
with Deno 2.x, PostgreSQL 16, and vanilla JS frontend with Tailwind CSS. Supports member
subscriptions, newsletters, content visibility tiers, and analytics.

## Commands

### Development

```bash
make dev              # Docker Compose: PostgreSQL + Redis + App (recommended)
deno task dev         # Local dev with hot reload (requires local PostgreSQL)
deno task db:migrate  # Run database migrations (uses ADMIN_EMAIL/ADMIN_PASSWORD env vars)
```

### Testing & Code Quality

```bash
deno task test                      # Run all tests
deno test --allow-all tests/shared_test.ts  # Unit tests (no server needed)
deno test --allow-all tests/api_test.ts     # API smoke tests (needs running server)
deno fmt              # Format code
deno lint             # Lint code
```

### Docker Utilities

```bash
make db-shell         # Open PostgreSQL shell (psql)
make db-reset         # Reset database (destroys data)
make logs             # Tail app logs
```

## Architecture

### Backend (Oak/Deno)

- **Entry point:** `backend/main.ts` - Oak HTTP server on port 8000
- **Routes:** `backend/routes/` - REST API under `/api/` prefix. Each domain (posts, members, tags,
  settings, analytics, newsletters, upload) has its own router file
- **Public API:** `backend/routes/public.ts` - unauthenticated blog reader endpoints at
  `/api/public/`. Enforces content visibility (public/members/paid/tiers) by checking member tier
  before returning full content
- **GraphQL:** `backend/graphql/` - available at `/graphql` (development only)
- **Auth:** JWT-based (HS256 via `jose`), dual identity system - `users` (admin/authors) and
  `members` (subscribers). Token in `Authorization: Bearer` header. Auth middleware at
  `backend/middleware/auth.ts` attaches `ctx.auth` with `isAuthenticated`, `isAdmin`, `user`,
  `member`
- **Database:** `db/connection.ts` exports `query()`, `queryOne()`, `execute()`, `transaction()` -
  connection pool (max 20). Raw SQL with parameterized queries ($1, $2, etc.), no ORM

### Frontend (Vanilla JS + Tailwind CSS)

- **No build step** - uses Tailwind Play CDN (`cdn.tailwindcss.com`), vanilla JS with inline scripts
- **Three HTML entry points:** `frontend/index.html` (public blog), `frontend/admin.html` (admin
  dashboard), `frontend/login.html` (auth)
- **Post detail page:** `frontend/post.html` - renders block-based content (text, heading, quote,
  code, divider)
- **Tailwind theme:** Custom colors (parchment, linen, ink, muted, crimson, forest, gold), fonts
  (Crimson Text serif, Inter sans), borderRadius (brutal: 2px) - "warm brutalism" design
- **Auth token:** stored in localStorage as `meridian_token`
- **Static serving:** Backend serves `frontend/` directory directly, with SPA fallback to
  `index.html`

### Shared

- `shared/types.ts` - All TypeScript domain types/enums (Post, User, Member, Tag, etc.)
- `shared/mod.ts` - Shared utilities (generateSlug, calculateReadingTime, stripHtml, etc.)

### Database

- Schema in `db/schema.sql` - UUID primary keys, PostgreSQL enums, JSONB for post content
  (block-based)
- Post content stored as `JSONB` array of `ContentBlock` objects (defined in `shared/types.ts`)
- Settings table is a singleton (id=1 constraint)
- `updated_at` columns managed by database triggers
- Admin user seeded via `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_NAME` env vars in `db/migrate.ts`

## Code Style

- Formatting: 2-space indent, semicolons, single quotes, 100-char line width (configured in
  `deno.json` fmt)
- Lint excludes `no-explicit-any`
- Import maps in `deno.json` - use bare specifiers (e.g., `'postgres'`, `'jose'`, `'@oak/oak'`)
- API responses follow `{ success: boolean, data?, error?, pagination? }` envelope pattern
