'use strict';

const bcrypt = require('bcryptjs');
const { pool } = require('../db');

async function main() {
  const email = String(process.env.PROVISION_ADMIN_EMAIL || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.PROVISION_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || '');
  const name = String(process.env.PROVISION_ADMIN_NAME || 'Runtime Administrator').trim();
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 12 || !name) throw new Error('Valid administrator credentials are required');
  await pool.query(
    `INSERT INTO users(email,password_hash,name,role) VALUES($1,$2,$3,'care_professional')
     ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash,name=EXCLUDED.name,role=EXCLUDED.role`,
    [email, await bcrypt.hash(password, 12), name],
  );
  console.log('Runtime administrator is ready.');
  await pool.end();
}

main().catch(async (error) => { console.error(error.message); await pool.end().catch(() => {}); process.exitCode = 1; });
