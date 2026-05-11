const { Pool } = require('pg');
require('dotenv').config();

let pool = null;
let dbWrapper = null;

async function initDB() {
  if (pool) return dbWrapper;
  pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await createSchema();
  dbWrapper = new AsyncDB(pool);
  return dbWrapper;
}

function getDB() {
  if (!dbWrapper) throw new Error('DB not initialized');
  return dbWrapper;
}

class AsyncDB {
  constructor(p) { this._pool = p; }
  async _q(sql, params=[]) {
    let i=0;
    let s = sql.replace(/\?/g,()=>`$${++i}`)
      .replace(/INSERT OR IGNORE INTO/gi,'INSERT INTO')
      .replace(/datetime\('now'\)/gi,"to_char(NOW(),'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"')");
    if (/^INSERT INTO project_members/i.test(s.trim())) s=s.trim().replace(/;?\s*$/,'')+' ON CONFLICT DO NOTHING';
    try { return await this._pool.query(s,params); }
    catch(e) { if(e.code==='23505'){const err=new Error(e.message);err.code='SQLITE_CONSTRAINT_UNIQUE';throw err;} throw e; }
  }
  async exec(sql) { await this._pool.query(sql); }
  async run(sql,...args) { await this._q(sql,args.flat()); return this; }
  async get(sql,...args) { const r=await this._q(sql,args.flat()); return r.rows[0]||undefined; }
  async all(sql,...args) { const r=await this._q(sql,args.flat()); return r.rows; }
  prepare(sql) { const s=this; return { run(...a){return s.run(sql,...a);}, get(...a){return s.get(sql,...a);}, all(...a){return s.all(sql,...a);} }; }
}

async function createSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member', color TEXT NOT NULL DEFAULT '#f5a623', created_at TEXT DEFAULT to_char(NOW(),'YYYY-MM-DD"T"HH24:MI:SS"Z"'), updated_at TEXT DEFAULT to_char(NOW(),'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
    CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', status TEXT DEFAULT 'active', priority TEXT DEFAULT 'medium', owner_id TEXT NOT NULL, deadline TEXT, tags TEXT DEFAULT '[]', created_at TEXT DEFAULT to_char(NOW(),'YYYY-MM-DD"T"HH24:MI:SS"Z"'), updated_at TEXT DEFAULT to_char(NOW(),'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
    CREATE TABLE IF NOT EXISTS project_members (project_id TEXT NOT NULL, user_id TEXT NOT NULL, joined_at TEXT DEFAULT to_char(NOW(),'YYYY-MM-DD"T"HH24:MI:SS"Z"'), PRIMARY KEY (project_id, user_id));
    CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT DEFAULT '', project_id TEXT NOT NULL, assignee_id TEXT, status TEXT DEFAULT 'todo', priority TEXT DEFAULT 'medium', due_date TEXT, created_by TEXT, created_at TEXT DEFAULT to_char(NOW(),'YYYY-MM-DD"T"HH24:MI:SS"Z"'), updated_at TEXT DEFAULT to_char(NOW(),'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
    CREATE TABLE IF NOT EXISTS activity_logs (id TEXT PRIMARY KEY, user_id TEXT, action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT, entity_name TEXT, created_at TEXT DEFAULT to_char(NOW(),'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
  `);
}

module.exports = { getDB, initDB };