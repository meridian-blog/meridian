# Meridian Blog Engine - Dockerfile
# Multi-stage build for production-ready image

# ---- Stage 1: Cache dependencies ----
FROM denoland/deno:2.7.4 AS deps

WORKDIR /app

# Copy only the files needed for dependency resolution
COPY deno.json deno.lock* ./
COPY backend/main.ts backend/main.ts
COPY shared/ shared/
COPY db/ db/

# Cache all dependencies so they don't re-download on code changes
RUN deno cache backend/main.ts db/migrate.ts || true

# ---- Stage 2: Production image ----
FROM denoland/deno:2.7.4

# Run as the built-in 'deno' user (non-root)
WORKDIR /app

# Copy cached dependencies from the first stage
COPY --from=deps /deno-dir /deno-dir

# Copy application source
COPY deno.json deno.lock* ./
COPY backend/ backend/
COPY frontend/ frontend/
COPY shared/ shared/
COPY db/ db/
COPY scripts/ scripts/

# Create uploads directory owned by deno user
RUN mkdir -p uploads && chown -R deno:deno /app

USER deno

# Expose port
EXPOSE 8000

# Set environment
ENV APP_ENV=production
ENV APP_PORT=8000

# Healthcheck: verify the server is responding (uses Deno fetch, no curl needed)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD deno eval "const r = await fetch('http://localhost:8000/health'); if (!r.ok) Deno.exit(1);"

# Default command: start the server only (no migrations).
# To run migrations, use:
#   docker compose exec app deno run --allow-net --allow-read --allow-env db/migrate.ts
# Or override the entrypoint:
#   docker compose run --rm app deno run --allow-net --allow-read --allow-env db/migrate.ts
CMD ["deno", "run", \
  "--allow-net", \
  "--allow-read", \
  "--allow-env", \
  "--allow-write=./uploads", \
  "backend/main.ts"]
