const express = require('express');
const { getDB } = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/stats', async (req, res, next) => {
  try {
    const db = getDB();
    const { id: uid, role } = req.user;
    let projectRows;
    if (role === 'admin') {
      projectRows = await db.all('SELECT id,status FROM projects');
    } else {
      projectRows = await db.all('SELECT DISTINCT p.id,p.status FROM projects p LEFT JOIN project_members pm ON p.id=pm.project_id WHERE p.owner_id=? OR pm.user_id=?', uid, uid);
    }
    const projectIds = projectRows.map(r => r.id);
    const now = new Date().toISOString();
    let tasks = [];
    for (const pid of projectIds) {
      const pt = await db.all('SELECT status,priority,due_date,assignee_id FROM tasks WHERE project_id=?', pid);
      tasks.push(...pt);
    }
    const totalMembers = await db.get('SELECT COUNT(*) as c FROM users');
    res.json({
      success: true, data: {
        total_projects: projectIds.length,
        active_projects: projectRows.filter(p => p.status === 'active').length,
        total_tasks: tasks.length,
        active_tasks: tasks.filter(t => t.status !== 'done').length,
        completed_tasks: tasks.filter(t => t.status === 'done').length,
        overdue_tasks: tasks.filter(t => t.status !== 'done' && t.due_date && t.due_date < now).length,
        my_tasks: tasks.filter(t => t.assignee_id === uid && t.status !== 'done').length,
        total_members: parseInt(totalMembers?.c || 0),
      }
    });
  } catch (err) { next(err); }
});

router.get('/activity', async (req, res, next) => {
  try {
    const db = getDB();
    const limit = parseInt(req.query.limit) || 10;
    const logs = await db.all('SELECT al.*,u.name as user_name,u.color as user_color FROM activity_logs al LEFT JOIN users u ON al.user_id=u.id ORDER BY al.created_at DESC LIMIT ?', limit);
    res.json({ success: true, data: { activity: logs } });
  } catch (err) { next(err); }
});

router.get('/chart', async (req, res, next) => {
  try {
    const db = getDB();
    const { id: uid, role } = req.user;
    let projects;
    if (role === 'admin') {
      projects = await db.all('SELECT id,name FROM projects ORDER BY created_at DESC LIMIT 6');
    } else {
      projects = await db.all('SELECT DISTINCT p.id,p.name FROM projects p LEFT JOIN project_members pm ON p.id=pm.project_id WHERE p.owner_id=? OR pm.user_id=? ORDER BY p.created_at DESC LIMIT 6', uid, uid);
    }
    const chart = [];
    for (const p of projects) {
      const tasks = await db.all('SELECT status FROM tasks WHERE project_id=?', p.id);
      chart.push({
        name: p.name.split(' ').slice(0, 2).join(' '),
        total: tasks.length,
        done: tasks.filter(t => t.status === 'done').length,
        in_progress: tasks.filter(t => t.status === 'in-progress').length,
        todo: tasks.filter(t => t.status === 'todo').length,
      });
    }
    res.json({ success: true, data: { chart } });
  } catch (err) { next(err); }
});

module.exports = router;
