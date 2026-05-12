const { Pool } = require('pg');
require('dotenv').config();

let pool = null;

async function initDB() {
  if (pool) return;
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL, role TEXT DEFAULT 'member', color TEXT DEFAULT '#f5a623',
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '',
      status TEXT DEFAULT 'active', priority TEXT DEFAULT 'medium',
      owner_id TEXT NOT NULL, deadline TEXT, tags TEXT DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS project_members (
      project_id TEXT NOT NULL, user_id TEXT NOT NULL,
      PRIMARY KEY (project_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT DEFAULT '',
      project_id TEXT NOT NULL, assignee_id TEXT, status TEXT DEFAULT 'todo',
      priority TEXT DEFAULT 'medium', due_date TEXT, created_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY, user_id TEXT, action TEXT NOT NULL,
      entity_type TEXT NOT NULL, entity_id TEXT, entity_name TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

async function q(sql, params = []) {
  let i = 0;
  let pg = sql
    .replace(/\?/g, () => `$${++i}`)
    .replace(/INSERT OR IGNORE INTO/gi, 'INSERT INTO')
    .replace(/datetime\('now'\)/gi, 'NOW()');
  if (/INSERT INTO project_members/i.test(pg)) {
    pg = pg.replace(/;?\s*$/, '') + ' ON CONFLICT DO NOTHING';
  }
  try {
    return await pool.query(pg, params);
  } catch (e) {
    if (e.code === '23505') {
      const err = new Error(e.message);
      err.code = 'SQLITE_CONSTRAINT_UNIQUE';
      throw err;
    }
    throw e;
  }
}

const db = {
  async run(sql, ...args) { await q(sql, args.flat()); return db; },
  async get(sql, ...args) { const r = await q(sql, args.flat()); return r.rows[0]; },
  async all(sql, ...args) { const r = await q(sql, args.flat()); return r.rows; },
  async exec(sql) { await pool.query(sql); },
  prepare(sql) {
    return {
      run: (...a) => db.run(sql, ...a),
      get: (...a) => db.get(sql, ...a),
      all: (...a) => db.all(sql, ...a)
    };
  }
};

function getDB() {
  if (!pool) throw new Error('DB not initialized');
  return db;
}

module.exports = { getDB, initDB };
