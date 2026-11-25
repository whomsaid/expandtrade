import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';
import { env } from '../backend/config/env.js';
import { buildPostgresSchemaSql } from '../backend/config/db.js';

const { Pool } = pg;

function getOrderedTableNames() {
  const ddl = buildPostgresSchemaSql();
  const names = [];
  const seen = new Set();
  for (const match of ddl.matchAll(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+([a-zA-Z0-9_]+)/gi)) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

function quoteIdent(ident) {
  return `"${String(ident).replace(/"/g, '""')}"`;
}

async function main() {
  const databaseUrl = env.databaseUrl;
  if (!databaseUrl || databaseUrl.includes('[YOUR-DATABASE-PASSWORD]')) {
    console.error(
      '[Migrate] Missing valid DATABASE_URL. Set DATABASE_URL in .env (with your real Supabase database password instead of [YOUR-DATABASE-PASSWORD]) and re-run.'
    );
    process.exit(1);
  }

  const sqlitePath = process.env.SQLITE_PATH
    ? path.resolve(process.env.SQLITE_PATH)
    : path.resolve(process.cwd(), 'data', 'bizflow.sqlite');

  if (!fs.existsSync(sqlitePath)) {
    console.error(`[Migrate] SQLite source database not found at ${sqlitePath}`);
    process.exit(1);
  }

  const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 5,
    connectionTimeoutMillis: 15_000,
    ssl: env.databaseSsl ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log('[Migrate] Connecting to Supabase PostgreSQL...');
    await pool.query('SELECT 1');

    console.log('[Migrate] Ensuring target schema, columns, and indexes...');
    await pool.query(buildPostgresSchemaSql());

    const orderedTables = getOrderedTableNames();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      for (const table of orderedTables) {
        const sqliteTableExists = sqlite
          .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?")
          .get(table);
        if (!sqliteTableExists) continue;

        const sqliteCols = sqlite
          .prepare(`PRAGMA table_info(${quoteIdent(table)})`)
          .all()
          .map((c) => c.name);

        const pgColsRes = await client.query(
          `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
          [table]
        );
        const pgColSet = new Set(pgColsRes.rows.map((r) => r.column_name));
        const sharedCols = sqliteCols.filter((c) => pgColSet.has(c));

        if (!sharedCols.length) continue;

        const rows = sqlite.prepare(`SELECT ${sharedCols.map(quoteIdent).join(', ')} FROM ${quoteIdent(table)}`).all();
        if (!rows.length) {
          continue;
        }

        const quotedCols = sharedCols.map(quoteIdent).join(', ');
        const batchSize = 150;
        let inserted = 0;

        for (let i = 0; i < rows.length; i += batchSize) {
          const chunk = rows.slice(i, i + batchSize);
          const values = [];
          const placeholders = chunk.map((row, rIdx) => {
            const rowPlaceholders = sharedCols.map((col, cIdx) => {
              values.push(row[col] === undefined ? null : row[col]);
              return `$${rIdx * sharedCols.length + cIdx + 1}`;
            });
            return `(${rowPlaceholders.join(', ')})`;
          });

          const sql = `INSERT INTO ${quoteIdent(table)} (${quotedCols}) VALUES ${placeholders.join(', ')} ON CONFLICT DO NOTHING`;
          const res = await client.query(sql, values);
          inserted += Number(res.rowCount || 0);
        }

        if (pgColSet.has('id')) {
          const seqRes = await client.query(`SELECT pg_get_serial_sequence($1, 'id') AS seq_name`, [table]);
          const seqName = seqRes.rows?.[0]?.seq_name;
          if (seqName) {
            await client.query(
              `SELECT setval($1, GREATEST(COALESCE((SELECT MAX(id) FROM ${quoteIdent(table)}), 0), 1), (SELECT COUNT(*) > 0 FROM ${quoteIdent(table)}))`,
              [seqName]
            );
          }
        }

        console.log(`[Migrate] ${table}: ${rows.length} source row(s), ${inserted} inserted`);
      }

      await client.query('COMMIT');
      console.log('[Migrate] Completed SQLite -> Supabase PostgreSQL migration successfully.');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } finally {
    sqlite.close();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[Migrate] Migration failed:', err.message);
  process.exit(1);
});
