const express = require('express');
const { body } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticate);

function canAccessProject(db, projectId, user) {
  if (user.role === 'admin') return true;
  const owner = db.get('SELECT id FROM projects WHERE id=? AND owner_id=?', projectId, user.id);
  const member = db.get('SELECT 1 FROM project_members WHERE project_id=? AND user_id=?', projectId, user.id);
  return !!(owner || member);
}

function enrichProject(db, p) {
  p.tags = JSON.parse(p.tags || '[]');
  p.members = db.all('SELECT u.id,u.name,u.email,u.role,u.color FROM project_members pm JOIN users u ON pm.user_id=u.id WHERE pm.project_id=?', p.id);
  p.owner = db.get('SELECT id,name,email,role,color FROM users WHERE id=?', p.owner_id);
  const tasks = db.all('SELECT status FROM tasks WHERE project_id=?', p.id);
  p.task_count = tasks.length;
  p.completed_tasks = tasks.filter(t=>t.status==='done').length;
  p.progress = tasks.length ? Math.round(p.completed_tasks/tasks.length*100) : 0;
  return p;
}

// GET /api/projects
router.get('/', (req, res, next) => {
  try {
    const db = getDB();
    const { status, priority, search } = req.query;
    let rows;
    if (req.user.role === 'admin') {
      rows = db.all('SELECT * FROM projects ORDER BY created_at DESC');
    } else {
      rows = db.all(`SELECT DISTINCT p.* FROM projects p LEFT JOIN project_members pm ON p.id=pm.project_id WHERE p.owner_id=? OR pm.user_id=? ORDER BY p.created_at DESC`, req.user.id, req.user.id);
    }
    let projects = rows.map(p => enrichProject(db, p));
    if (status)   projects = projects.filter(p=>p.status===status);
    if (priority) projects = projects.filter(p=>p.priority===priority);
    if (search)   projects = projects.filter(p=>p.name.toLowerCase().includes(search.toLowerCase())||p.description.toLowerCase().includes(search.toLowerCase()));
    res.json({ success:true, data:{ projects, total:projects.length } });
  } catch(err) { next(err); }
});

// GET /api/projects/:id
router.get('/:id', (req, res, next) => {
  try {
    const db = getDB();
    if (!canAccessProject(db, req.params.id, req.user))
      return res.status(403).json({ success:false, message:'Access denied' });
    const p = db.get('SELECT * FROM projects WHERE id=?', req.params.id);
    if (!p) return res.status(404).json({ success:false, message:'Project not found' });
    res.json({ success:true, data:{ project: enrichProject(db,p) } });
  } catch(err) { next(err); }
});

// POST /api/projects
router.post('/', requireRole('admin','manager'), [
  body('name').trim().notEmpty().withMessage('Project name required').isLength({max:100}),
  body('status').optional().isIn(['active','on-hold','completed','archived']),
  body('priority').optional().isIn(['high','medium','low']),
  body('deadline').optional().isISO8601(),
  body('members').optional().isArray(),
], validate, (req, res, next) => {
  try {
    const db = getDB();
    const { name, description='', status='active', priority='medium', deadline, tags=[], members=[] } = req.body;
    const id = uuidv4();
    db.run('INSERT INTO projects (id,name,description,status,priority,owner_id,deadline,tags) VALUES (?,?,?,?,?,?,?,?)',
      id, name, description, status, priority, req.user.id, deadline||null, JSON.stringify(tags));
    const allMembers = [...new Set([req.user.id,...members])];
    for (const uid of allMembers) {
      if (db.get('SELECT id FROM users WHERE id=?', uid))
        db.run('INSERT OR IGNORE INTO project_members (project_id,user_id) VALUES (?,?)', id, uid);
    }
    db.run('INSERT INTO activity_logs (id,user_id,action,entity_type,entity_id,entity_name) VALUES (?,?,?,?,?,?)', uuidv4(), req.user.id, 'created project', 'project', id, name);
    const project = enrichProject(db, db.get('SELECT * FROM projects WHERE id=?', id));
    res.status(201).json({ success:true, data:{ project } });
  } catch(err) { next(err); }
});

// PUT /api/projects/:id
router.put('/:id', [
  body('name').optional().trim().notEmpty().isLength({max:100}),
  body('status').optional().isIn(['active','on-hold','completed','archived']),
  body('priority').optional().isIn(['high','medium','low']),
  body('deadline').optional().isISO8601(),
], validate, (req, res, next) => {
  try {
    const db = getDB();
    const existing = db.get('SELECT * FROM projects WHERE id=?', req.params.id);
    if (!existing) return res.status(404).json({ success:false, message:'Project not found' });
    if (req.user.role!=='admin' && existing.owner_id!==req.user.id)
      return res.status(403).json({ success:false, message:'Only owner or admin can edit' });
    const { name, description, status, priority, deadline, tags, members } = req.body;
    const fields=[], vals=[];
    if (name!==undefined)        { fields.push('name=?');        vals.push(name); }
    if (description!==undefined) { fields.push('description=?'); vals.push(description); }
    if (status!==undefined)      { fields.push('status=?');      vals.push(status); }
    if (priority!==undefined)    { fields.push('priority=?');    vals.push(priority); }
    if (deadline!==undefined)    { fields.push('deadline=?');    vals.push(deadline); }
    if (tags!==undefined)        { fields.push('tags=?');        vals.push(JSON.stringify(tags)); }
    fields.push('updated_at=?'); vals.push(new Date().toISOString());
    db.run(`UPDATE projects SET ${fields.join(',')} WHERE id=?`, ...vals, req.params.id);
    if (members!==undefined) {
      db.run('DELETE FROM project_members WHERE project_id=?', req.params.id);
      const all = [...new Set([existing.owner_id,...members])];
      for (const uid of all)
        if (db.get('SELECT id FROM users WHERE id=?',uid))
          db.run('INSERT OR IGNORE INTO project_members (project_id,user_id) VALUES (?,?)', req.params.id, uid);
    }
    db.run('INSERT INTO activity_logs (id,user_id,action,entity_type,entity_id,entity_name) VALUES (?,?,?,?,?,?)', uuidv4(), req.user.id, 'updated project', 'project', req.params.id, name||existing.name);
    const project = enrichProject(db, db.get('SELECT * FROM projects WHERE id=?', req.params.id));
    res.json({ success:true, data:{ project } });
  } catch(err) { next(err); }
});

// DELETE /api/projects/:id
router.delete('/:id', requireRole('admin','manager'), (req, res, next) => {
  try {
    const db = getDB();
    const p = db.get('SELECT * FROM projects WHERE id=?', req.params.id);
    if (!p) return res.status(404).json({ success:false, message:'Project not found' });
    if (req.user.role!=='admin' && p.owner_id!==req.user.id)
      return res.status(403).json({ success:false, message:'Only owner or admin can delete' });
    db.run('DELETE FROM project_members WHERE project_id=?', req.params.id);
    db.run('DELETE FROM tasks WHERE project_id=?', req.params.id);
    db.run('DELETE FROM projects WHERE id=?', req.params.id);
    db.run('INSERT INTO activity_logs (id,user_id,action,entity_type,entity_name) VALUES (?,?,?,?,?)', uuidv4(), req.user.id, 'deleted project', 'project', p.name);
    res.json({ success:true, message:'Project deleted' });
  } catch(err) { next(err); }
});

// GET /api/projects/:id/stats
router.get('/:id/stats', (req, res, next) => {
  try {
    const db = getDB();
    const tasks = db.all('SELECT status,priority FROM tasks WHERE project_id=?', req.params.id);
    const byStatus={ todo:0,'in-progress':0,done:0 };
    const byPriority={ high:0,medium:0,low:0 };
    for (const t of tasks) { byStatus[t.status]=(byStatus[t.status]||0)+1; byPriority[t.priority]=(byPriority[t.priority]||0)+1; }
    res.json({ success:true, data:{ total:tasks.length, byStatus, byPriority, progress: tasks.length?Math.round(byStatus.done/tasks.length*100):0 } });
  } catch(err) { next(err); }
});

module.exports = router;
