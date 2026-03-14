# Meridian Blog Engine

[![CI](https://github.com/meridian-blog/meridian/actions/workflows/ci.yml/badge.svg)](https://github.com/meridian-blog/meridian/actions/workflows/ci.yml)

A self-hosted, zero-platform-fee publishing platform. Own your content, own your audience, keep 100%
of your revenue.

Built with **Deno 2.x**, **PostgreSQL 16**, and **vanilla JS + Tailwind CSS**.

## Why Meridian?

- **Zero platform fees** — Connect your own Stripe account, keep every dollar
- **Self-hosted** — Deploy on your own infrastructure, no vendor lock-in
- **No build step** — Vanilla JS frontend with Tailwind Play CDN, edit and refresh
- **Block-based content** — Structured content stored as JSON, not raw HTML
- **Member subscriptions** — Free, premium, and custom tiers with Stripe billing
- **Newsletters** — Send to subscribers via Resend (or any email provider)
- **Jekyll/WordPress import** — Migrate your existing blog with one command

## Quick Start

### Option 1: Docker (Recommended)

```bash
git clone <repo-url> meridian-blog
cd meridian-blog
cp .env.example .env    # Edit with your settings
make dev                # Starts PostgreSQL + Redis + App
```

### Option 2: Local Deno

Prerequisites: [Deno 2.x](https://deno.land/), [PostgreSQL 16](https://www.postgresql.org/)

```bash
cp .env.example .env
# Edit .env with your DATABASE_URL

deno task db:migrate    # Create tables + admin user
deno task dev           # Start with hot reload
```

Open **http://localhost:8000** — that's it.

### Default Admin

- **Email:** `admin@meridian.blog` (or whatever you set in `.env`)
- **Password:** `changeme123` (set `ADMIN_PASSWORD` in `.env`)

## Configuration

```bash
# Required
ADMIN_EMAIL=admin@meridian.blog
ADMIN_PASSWORD=changeme123
ADMIN_NAME=Admin
APP_SECRET=change-this-to-a-random-string-at-least-32-chars
DATABASE_URL=postgres://meridian:meridian_secret@localhost:5432/meridian

# Optional: Payments
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Optional: Email (for newsletters)
EMAIL_PROVIDER=resend
EMAIL_API_KEY=re_...
EMAIL_FROM=newsletter@yourdomain.com
```

### Stripe Setup

1. Create a [Stripe](https://stripe.com) account
2. Add your `STRIPE_SECRET_KEY` to `.env`
3. Create subscription tiers in the admin dashboard
4. Set up a webhook endpoint pointing to `https://yourdomain.com/api/stripe/webhook` for events:
   `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`,
   `invoice.payment_failed`
5. Add the `STRIPE_WEBHOOK_SECRET` to `.env`

Meridian auto-creates Stripe Products and Prices from your tiers — no manual Stripe dashboard
configuration needed.

### Email Setup

1. Create a [Resend](https://resend.com) account and verify your domain
2. Add `EMAIL_PROVIDER=resend` and your `EMAIL_API_KEY` to `.env`
3. Set `EMAIL_FROM` to your verified sender address

Without email configured, newsletters log to console (useful for development).

## Importing from Jekyll

```bash
deno task import:jekyll https://yourblog.com/feed.xml --dry-run  # Preview
deno task import:jekyll https://yourblog.com/feed.xml            # Import
```

Parses Atom/RSS feeds, converts HTML to content blocks, preserves tags and cover images.

## Project Structure

```
meridian-blog/
├── backend/
│   ├── main.ts              # Oak HTTP server entry point
│   ├── middleware/           # Auth (JWT), error handling, logging
│   ├── routes/              # REST API routes
│   │   ├── public.ts        # Blog reader API (no auth)
│   │   ├── posts.ts         # Post CRUD (admin)
│   │   ├── pages.ts         # Static pages CRUD (admin)
│   │   ├── members.ts       # Member management (admin)
│   │   ├── newsletters.ts   # Newsletter compose + send
│   │   ├── stripe.ts        # Checkout, webhooks, portal
│   │   └── ...
│   ├── graphql/             # GraphQL schema + resolvers
│   └── services/
│       └── email.ts         # Email sending (Resend)
├── frontend/
│   ├── index.html           # Blog homepage
│   ├── post.html            # Post detail + paywall
│   ├── page.html            # Static page
│   ├── search.html          # Full-text search
│   ├── tag.html             # Tag filtered view
│   ├── admin.html           # Admin dashboard
│   └── login.html           # Auth page
├── db/
│   ├── schema.sql           # PostgreSQL schema
│   ├── connection.ts        # Connection pool
│   └── migrate.ts           # Migration runner + admin seeding
├── shared/
│   ├── types.ts             # TypeScript domain types
│   └── mod.ts               # Shared utilities
├── tools/
│   └── import-jekyll.ts     # Jekyll/Atom feed importer
└── tests/
    ├── shared_test.ts       # Unit tests (no server needed)
    └── api_test.ts          # API smoke tests
```

## API Endpoints

### Public (no auth)

| Method | Endpoint                  | Description                       |
| ------ | ------------------------- | --------------------------------- |
| GET    | `/api/public/site`        | Site settings, social links       |
| GET    | `/api/public/posts`       | Published posts (paginated)       |
| GET    | `/api/public/posts/:slug` | Single post (respects visibility) |
| GET    | `/api/public/tags`        | All tags with post counts         |
| GET    | `/api/public/pages/:slug` | Static page                       |
| GET    | `/api/public/search?q=`   | Full-text search                  |
| GET    | `/api/public/rss`         | RSS 2.0 feed                      |
| POST   | `/api/public/subscribe`   | Newsletter signup                 |

### Admin (JWT required)

| Method     | Endpoint                    | Description        |
| ---------- | --------------------------- | ------------------ |
| GET/POST   | `/api/posts`                | List/create posts  |
| PUT/DELETE | `/api/posts/:id`            | Update/delete post |
| GET/POST   | `/api/pages`                | List/create pages  |
| GET        | `/api/members`              | List members       |
| POST       | `/api/newsletters/:id/send` | Send newsletter    |
| GET        | `/api/analytics/dashboard`  | Dashboard stats    |
| GET/PUT    | `/api/settings`             | Site settings      |

### Stripe

| Method | Endpoint               | Description               |
| ------ | ---------------------- | ------------------------- |
| GET    | `/api/stripe/tiers`    | Active subscription tiers |
| POST   | `/api/stripe/checkout` | Create checkout session   |
| POST   | `/api/stripe/portal`   | Customer portal session   |
| POST   | `/api/stripe/webhook`  | Stripe event webhook      |

### GraphQL

Available at `/graphql` in development mode.

## Development Commands

```bash
deno task dev             # Dev server with hot reload
deno task test            # Run all tests
deno task db:migrate      # Run migrations
deno task db:seed         # Seed sample data
deno task import:jekyll   # Import from Jekyll
deno fmt                  # Format code
deno lint                 # Lint code
deno check backend/main.ts  # Type-check
```

### Docker

```bash
make dev          # Start all services
make stop         # Stop services
make logs         # Tail app logs
make db-shell     # PostgreSQL shell
make db-reset     # Reset database
```

## Deploy

### Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=https://github.com/meridian-blog/meridian)

1. Click the button above — Railway reads `railway.json` and builds from Dockerfile
2. Add a **PostgreSQL** plugin (click "New" > "Database" > PostgreSQL)
3. Set environment variables in the service Settings > Variables:
   - `APP_SECRET` — run `openssl rand -base64 48` to generate
   - `APP_ENV` — `production`
   - `ADMIN_EMAIL` — your email
   - `ADMIN_PASSWORD` — strong password
4. Railway auto-deploys. Migrations run on every start.

### Render

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/meridian-blog/meridian)

1. Click the button — Render reads `render.yaml` and creates a PostgreSQL database + web service
2. `APP_SECRET` and `ADMIN_PASSWORD` are auto-generated
3. After deploy, go to Environment and set `ADMIN_EMAIL` to your real email

### Fly.io

```bash
fly launch                              # Create app from fly.toml
fly postgres create --name meridian-db  # Create Postgres
fly postgres attach meridian-db         # Sets DATABASE_URL automatically
fly secrets set \
  APP_SECRET=$(openssl rand -base64 48) \
  ADMIN_EMAIL=you@example.com \
  ADMIN_PASSWORD=your-strong-password
fly deploy                              # Build + deploy + run migrations
```

### Docker (Self-Hosted)

```bash
git clone https://github.com/meridian-blog/meridian.git
cd meridian
cp .env.example .env                    # Edit all [REQUIRED] values
# Run migrations
docker compose --profile production run --rm app-prod \
  deno run --allow-net --allow-read --allow-env --allow-write=./uploads db/migrate.ts
# Start (includes Caddy for automatic HTTPS)
docker compose --profile production up -d
```

Requires ports 80 and 443 open. Caddy handles SSL certificates automatically via Let's Encrypt.

## Updating

When a new version of Meridian is released, here's how to update your deployment:

### Railway / Render

If your service is connected to the GitHub repo:

1. Pull the latest changes (or Render/Railway auto-deploys on push)
2. Migrations run automatically — Railway via `startCommand`, Render via `preDeployCommand`
3. That's it. Zero downtime.

If you forked the repo:

```bash
git remote add upstream https://github.com/meridian-blog/meridian.git
git fetch upstream
git merge upstream/main
git push origin main   # Triggers auto-deploy
```

### Fly.io

```bash
git pull origin main
fly deploy             # Builds new image, runs migrations via release_command
```

### Docker (Self-Hosted)

```bash
git pull origin main

# Run migrations first
docker compose --profile production run --rm app-prod \
  deno run --allow-net --allow-read --allow-env --allow-write=./uploads db/migrate.ts

# Rebuild and restart
docker compose --profile production up -d --build
```

### What about my data?

Updates never touch your data. The migration system tracks which migrations have already run (in the
`_migrations` table) and only applies new ones. Your posts, members, settings, and uploads are safe.

## Design

Meridian uses a **"warm brutalism"** design language:

- **Colors:** Parchment (#FAF9F6), Ink (#1A1A1A), Crimson (#C41E3A), Muted (#6B6B6B)
- **Typography:** Crimson Text (serif headings) + Inter (sans body)
- **Borders:** 2px radius ("brutal"), thin dividers at 6% opacity
- **Spacing:** Generous whitespace, 104px section gaps

## License

AGPLv3 — see [LICENSE](LICENSE)
