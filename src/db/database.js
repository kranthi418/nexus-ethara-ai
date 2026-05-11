const fs = require('fs');
const path = require('path');
require('dotenv').config();

const DB_FILE = path.resolve(__dirname, '../../nexus.db.json');
let _db = null;

class SyncDB {
  constructor(sqljs) {
    this._SQL = sqljs;
    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        const buf = Buffer.from(raw.db, 'base64');
        this._inner = new sqljs.Database(buf);
      } catch { this._inner = new sqljs.Database(); }
    } else {
      this._inner = new sqljs.Database();
    }
    this._inner.run('PRAGMA journal_mode=WAL;');
  }

  _save() {
    const buf = Buffer.from(this._inner.export());
    fs.writeFileSync(DB_FILE, JSON.stringify({ db: buf.toString('base64') }));
  }

  exec(sql) { this._inner.run(sql); this._save(); }

  _flatParams(params) {
    if (!params || params.length === 0) return [];
    if (params.length === 1 && params[0] !== null && typeof params[0] === 'object' && !Array.isArray(params[0])) return params[0];
    if (params.length === 1 && Array.isArray(params[0])) return params[0];
    return params;
  }

  run(sql, ...args) {
    try { this._inner.run(sql, this._flatParams(args)); this._save(); }
    catch(e) {
      if (e.message && e.message.includes('UNIQUE')) { const err=new Error(e.message); err.code='SQLITE_CONSTRAINT_UNIQUE'; throw err; }
      throw e;
    }
    return this;
  }

  get(sql, ...args) {
    const stmt = this._inner.prepare(sql);
    stmt.bind(this._flatParams(args));
    const result = stmt.step() ? stmt.getAsObject() : undefined;
    stmt.free();
    return result;
  }

  all(sql, ...args) {
    const rows = [];
    const stmt = this._inner.prepare(sql);
    stmt.bind(this._flatParams(args));
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  prepare(sql) {
    const self = this;
    return {
      run(...args) { return self.run(sql, ...args); },
      get(...args) { return self.get(sql, ...args); },
      all(...args) { return self.all(sql, ...args); },
    };
  }
}

async function initDB() {
  if (_db) return _db;
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  _db = new SyncDB(SQL);
  _createSchema(_db);
  return _db;
}

function getDB() {
  if (!_db) throw new Error('DB not initialized. Ensure initDB() completed before requests.');
  return _db;
}

function _createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member', color TEXT NOT NULL DEFAULT '#f5a623', created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'active', priority TEXT NOT NULL DEFAULT 'medium', owner_id TEXT NOT NULL, deadline TEXT, tags TEXT DEFAULT '[]', created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS project_members (project_id TEXT NOT NULL, user_id TEXT NOT NULL, joined_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (project_id, user_id));
    CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT DEFAULT '', project_id TEXT NOT NULL, assignee_id TEXT, status TEXT NOT NULL DEFAULT 'todo', priority TEXT NOT NULL DEFAULT 'medium', due_date TEXT, created_by TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE IF NOT EXISTS activity_logs (id TEXT PRIMARY KEY, user_id TEXT, action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT, entity_name TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
  `);
}

module.exports = { getDB, initDB };
