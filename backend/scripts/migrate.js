'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const dbModule = require('../db');
const pool = dbModule.pool;

async function migrate() {
  if (typeof dbModule.initDb === 'function') await dbModule.initDb();
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('governed_workflow_migrations'))");
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
    const directory = path.resolve(__dirname, '../migrations');
    const files = fs.readdirSync(directory).filter((name) => name.endsWith('.sql')).sort();
    for (const name of files) {
      const sql = fs.readFileSync(path.join(directory, name), 'utf8');
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');
      const prior = await client.query('SELECT checksum FROM schema_migrations WHERE name=$1', [name]);
      if (prior.rows[0]?.checksum && prior.rows[0].checksum !== checksum) throw new Error(`Applied migration changed: ${name}`);
      if (prior.rows[0]) continue;
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(name, checksum) VALUES ($1,$2)', [name, checksum]);
      console.log(`Applied ${name}`);
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('governed_workflow_migrations'))").catch(() => {});
    client.release();
    await pool.end();
  }
}

migrate().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

