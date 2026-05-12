const express = require('express');
const { body } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../db/database');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticate);

async function enrichTask(db, t) {
  if (!t) return null;
  t.assignee = t.assignee_id ? await db.get('SELECT id,name,email,role,color FROM users WHERE id=?', t.assignee_id) : null;
  t.project = await db.get('SELECT id,name,status FROM projects WHERE id=?', t.project_id);
  return t;
}

router.get('/', async (req, res, next) => {
  try {
    const db = getDB();
    const { project_id, status, priority, assignee_id, search } = req.query;
    let tasks;
    if (req.user.role === 'admin') {
      tasks = await db.all('SELECT * FROM tasks ORDER BY created_at DESC');
    } else {
      tasks = await db.all('SELECT t.* FROM tasks t JOIN projects p ON t.project_id=p.id LEFT JOIN project_members pm ON p.id=pm.project_id WHERE p.owner_id=? OR pm.user_id=? GROUP BY t.id ORDER BY t.created_at DESC', req.user.id, req.user.id);
    }
    if (project_id) tasks = tasks.filter(t => t.project_id === project_id);
    if (status) tasks = tasks.filter(t => t.status === status);
    if (priority) tasks = tasks.filter(t => t.priority === priority);
    if (assignee_id) tasks = tasks.filter(t => t.assignee_id === assignee_id);
    if (search) tasks = tasks.filter(t => t.title.toLowerCase().includes(search.toLowerCase()));
    const enriched = await Promise.all(tasks.map(t => enrichTask(db, t)));
    res.json({ success: true, data: { tasks: enriched, total: enriched.length } });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const db = getDB();
    const task = await db.get('SELECT * FROM tasks WHERE id=?', req.params.id);
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
    res.json({ success: true, data: { task: await enrichTask(db, task) } });
  } catch (err) { next(err); }
});

router.post('/', [
  body('title').trim().notEmpty().withMessage('Task title required').isLength({ max: 200 }),
  body('project_id').notEmpty().withMessage('Project ID required'),
  body('status').optional().isIn(['todo', 'in-progress', 'done']),
  body('priority').optional().isIn(['high', 'medium', 'low']),
], validate, async (req, res, next) => {
  try {
    const db = getDB();
    const { title, description = '', project_id, assignee_id, status = 'todo', priority = 'medium', due_date } = req.body;
    if (!await db.get('SELECT id FROM projects WHERE id=?', project_id)) return res.status(404).json({ success: false, message: 'Project not found' });
    const id = uuidv4();
    await db.run('INSERT INTO tasks (id,title,description,project_id,assignee_id,status,priority,due_date,created_by) VALUES (?,?,?,?,?,?,?,?,?)', id, title, description, project_id, assignee_id || null, status, priority, due_date || null, req.user.id);
    await db.run('INSERT INTO activity_logs (id,user_id,action,entity_type,entity_id,entity_name) VALUES (?,?,?,?,?,?)', uuidv4(), req.user.id, 'created task', 'task', id, title);
    const task = await enrichTask(db, await db.get('SELECT * FROM tasks WHERE id=?', id));
    res.status(201).json({ success: true, data: { task } });
  } catch (err) { next(err); }
});

router.put('/:id', [
  body('title').optional().trim().notEmpty().isLength({ max: 200 }),
  body('status').optional().isIn(['todo', 'in-progress', 'done']),
  body('priority').optional().isIn(['high', 'medium', 'low']),
], validate, async (req, res, next) => {
  try {
    const db = getDB();
    const existing = await db.get('SELECT * FROM tasks WHERE id=?', req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Task not found' });
    const { title, description, project_id, assignee_id, status, priority, due_date } = req.body;
    const fields = [], vals = [];
    if (title !== undefined) { fields.push('title=?'); vals.push(title); }
    if (description !== undefined) { fields.push('description=?'); vals.push(description); }
    if (project_id !== undefined) { fields.push('project_id=?'); vals.push(project_id); }
    if (assignee_id !== undefined) { fields.push('assignee_id=?'); vals.push(assignee_id); }
    if (status !== undefined) { fields.push('status=?'); vals.push(status); }
    if (priority !== undefined) { fields.push('priority=?'); vals.push(priority); }
    if (due_date !== undefined) { fields.push('due_date=?'); vals.push(due_date); }
    fields.push('updated_at=NOW()');
    await db.run(`UPDATE tasks SET ${fields.join(',')} WHERE id=?`, ...vals, req.params.id);
    if (status && status !== existing.status && status === 'done') {
      await db.run('INSERT INTO activity_logs (id,user_id,action,entity_type,entity_id,entity_name) VALUES (?,?,?,?,?,?)', uuidv4(), req.user.id, 'completed task', 'task', req.params.id, existing.title);
    }
    const task = await enrichTask(db, await db.get('SELECT * FROM tasks WHERE id=?', req.params.id));
    res.json({ success: true, data: { task } });
  } catch (err) { next(err); }
});

router.patch('/:id/status', [body('status').isIn(['todo', 'in-progress', 'done'])], validate, async (req, res, next) => {
  try {
    const db = getDB();
    const task = await db.get('SELECT * FROM tasks WHERE id=?', req.params.id);
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
    await db.run('UPDATE tasks SET status=?,updated_at=NOW() WHERE id=?', req.body.status, req.params.id);
    if (req.body.status === 'done') {
      await db.run('INSERT INTO activity_logs (id,user_id,action,entity_type,entity_id,entity_name) VALUES (?,?,?,?,?,?)', uuidv4(), req.user.id, 'completed task', 'task', req.params.id, task.title);
    }
    res.json({ success: true, data: { task: await enrichTask(db, await db.get('SELECT * FROM tasks WHERE id=?', req.params.id)) } });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const db = getDB();
    const task = await db.get('SELECT * FROM tasks WHERE id=?', req.params.id);
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
    await db.run('DELETE FROM tasks WHERE id=?', req.params.id);
    res.json({ success: true, message: 'Task deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
