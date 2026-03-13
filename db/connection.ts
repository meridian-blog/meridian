/**
 * Meridian Database Connection
 * PostgreSQL connection management with connection pooling
 */

import { Client, Pool } from 'postgres';

// Database configuration
const DATABASE_URL = Deno.env.get('DATABASE_URL') || 'postgres://localhost:5432/meridian';

// Connection pool
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool(DATABASE_URL, 20); // 20 connections max
  }
  return pool;
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const result = await client.queryObject<T>(sql, params);
    return result.rows;
  } finally {
    client.release();
  }
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] || null;
}

export async function execute(sql: string, params?: unknown[]): Promise<number> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const result = await client.queryObject(sql, params);
    return result.rowCount || 0;
  } finally {
    client.release();
  }
}

export async function transaction<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.queryObject('BEGIN');
    const result = await fn(client);
    await client.queryObject('COMMIT');
    return result;
  } catch (error) {
    await client.queryObject('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// Health check
export async function isDatabaseHealthy(): Promise<boolean> {
  try {
    await query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
