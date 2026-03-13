/**
 * Meridian Database Migration Runner
 * Handles schema creation and migrations
 */

import { Client } from 'postgres';
import * as bcrypt from 'bcrypt';

const DATABASE_URL = Deno.env.get('DATABASE_URL') || 'postgres://localhost:5432/meridian';

const APP_ENV = Deno.env.get('APP_ENV') || 'development';
const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL') || 'admin@meridian.blog';
const ADMIN_PASSWORD = Deno.env.get('ADMIN_PASSWORD') || 'changeme123';
const ADMIN_NAME = Deno.env.get('ADMIN_NAME') || 'Admin';

if (APP_ENV === 'production' && !Deno.env.get('ADMIN_PASSWORD')) {
  console.error(
    'WARNING: ADMIN_PASSWORD is not set and defaults to "changeme123". ' +
      'This is insecure for production. Set ADMIN_PASSWORD env var.',
  );
}

async function runMigrations() {
  console.log('🔄 Running Meridian database migrations...\n');

  const client = new Client(DATABASE_URL);
  await client.connect();

  try {
    // Create migrations tracking table
    await client.queryObject(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Check which migrations have run
    const result = await client.queryObject<{ name: string }>(
      'SELECT name FROM _migrations ORDER BY id',
    );
    const executedMigrations = new Set(result.rows.map((r) => r.name));

    // Read and execute schema
    const schema = await Deno.readTextFile(new URL('./schema.sql', import.meta.url));

    if (!executedMigrations.has('001_initial_schema')) {
      console.log('📦 Applying: 001_initial_schema');
      await client.queryObject(schema);
      await client.queryObject(
        'INSERT INTO _migrations (name) VALUES ($1)',
        ['001_initial_schema'],
      );
      console.log('   ✅ Applied successfully\n');
    } else {
      console.log('📦 001_initial_schema - already applied\n');
    }

    // Seed default data
    if (!executedMigrations.has('002_seed_defaults')) {
      console.log('🌱 Applying: 002_seed_defaults');

      // Create default owner user from env vars
      if (!Deno.env.get('ADMIN_PASSWORD')) {
        console.warn(
          '⚠️  WARNING: Using default admin password. Set ADMIN_PASSWORD env var for production!',
        );
      }
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, salt);
      await client.queryObject(`
        INSERT INTO users (email, password_hash, name, role, email_verified)
        VALUES (
          '${ADMIN_EMAIL}',
          '${passwordHash}',
          '${ADMIN_NAME}',
          'owner',
          true
        )
        ON CONFLICT (email) DO NOTHING
      `);

      // Create default subscription tiers
      await client.queryObject(`
        INSERT INTO subscription_tiers (name, description, price, interval, benefits, sort_order)
        VALUES 
          ('Free', 'Access to free content and newsletters', 0, 'month', '{"Newsletter access","Community comments"}', 0),
          ('Basic', 'Premium content and member-only posts', 500, 'month', '{"All free features","Premium articles","Monthly perks"}', 1),
          ('Premium', 'Full access to everything', 1500, 'month', '{"All Basic features","Exclusive content","Direct support","Early access"}', 2)
        ON CONFLICT DO NOTHING
      `);

      await client.queryObject(
        'INSERT INTO _migrations (name) VALUES ($1)',
        ['002_seed_defaults'],
      );
      console.log('   ✅ Applied successfully\n');
    } else {
      console.log('🌱 002_seed_defaults - already applied\n');
    }

    // Add post_count to tags (referenced by trigger but missing from schema)
    if (!executedMigrations.has('003_add_tag_post_count')) {
      console.log('📦 Applying: 003_add_tag_post_count');
      await client.queryObject(`
        ALTER TABLE tags ADD COLUMN IF NOT EXISTS post_count INTEGER NOT NULL DEFAULT 0
      `);
      await client.queryObject(
        'INSERT INTO _migrations (name) VALUES ($1)',
        ['003_add_tag_post_count'],
      );
      console.log('   ✅ Applied successfully\n');
    } else {
      console.log('📦 003_add_tag_post_count - already applied\n');
    }

    // Add kudos_count to posts
    if (!executedMigrations.has('003_add_kudos')) {
      console.log('📦 Applying: 003_add_kudos');
      await client.queryObject(`
        ALTER TABLE posts ADD COLUMN IF NOT EXISTS kudos_count INTEGER NOT NULL DEFAULT 0
      `);
      await client.queryObject(
        'INSERT INTO _migrations (name) VALUES ($1)',
        ['003_add_kudos'],
      );
      console.log('   ✅ Applied successfully\n');
    } else {
      console.log('📦 003_add_kudos - already applied\n');
    }

    // Add permalink_format to settings
    if (!executedMigrations.has('004_add_permalink_format')) {
      console.log('📦 Applying: 004_add_permalink_format');
      await client.queryObject(`
        ALTER TABLE settings ADD COLUMN IF NOT EXISTS permalink_format VARCHAR(50) DEFAULT '/:slug'
      `);
      await client.queryObject(
        'INSERT INTO _migrations (name) VALUES ($1)',
        ['004_add_permalink_format'],
      );
      console.log('   ✅ Applied successfully\n');
    } else {
      console.log('📦 004_add_permalink_format - already applied\n');
    }

    console.log('✨ All migrations completed!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Run if called directly
if (import.meta.main) {
  runMigrations().catch(console.error);
}

export { runMigrations };
