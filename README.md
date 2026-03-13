# Meridian Blog Engine

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

## Design

Meridian uses a **"warm brutalism"** design language:

- **Colors:** Parchment (#FAF9F6), Ink (#1A1A1A), Crimson (#C41E3A), Muted (#6B6B6B)
- **Typography:** Crimson Text (serif headings) + Inter (sans body)
- **Borders:** 2px radius ("brutal"), thin dividers at 6% opacity
- **Spacing:** Generous whitespace, 104px section gaps

## License

MIT
