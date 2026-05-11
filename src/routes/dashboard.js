const express = require('express');
const { getDB } = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/stats', (req, res, next) => {
  try {
    const db = getDB();
    const { id:uid, role } = req.user;
    let projectIds;
    if (role==='admin') {
      projectIds = db.all('SELECT id FROM projects').map(r=>r.id);
    } else {
      projectIds = db.all('SELECT DISTINCT p.id FROM projects p LEFT JOIN project_members pm ON p.id=pm.project_id WHERE p.owner_id=? OR pm.user_id=?', uid, uid).map(r=>r.id);
    }
    const now = new Date().toISOString();
    let tasks=[], activeProjects=0;
    for (const pid of projectIds) {
      const pt = db.all('SELECT status,priority,due_date,assignee_id FROM tasks WHERE project_id=?', pid);
      tasks.push(...pt);
      const p = db.get('SELECT status FROM projects WHERE id=?', pid);
      if (p && p.status==='active') activeProjects++;
    }
    res.json({ success:true, data:{
      total_projects: projectIds.length,
      active_projects: activeProjects,
      total_tasks: tasks.length,
      active_tasks: tasks.filter(t=>t.status!=='done').length,
      completed_tasks: tasks.filter(t=>t.status==='done').length,
      overdue_tasks: tasks.filter(t=>t.status!=='done'&&t.due_date&&t.due_date<now).length,
      my_tasks: tasks.filter(t=>t.assignee_id===uid&&t.status!=='done').length,
      total_members: (db.get('SELECT COUNT(*) as c FROM users')||{c:0}).c,
    }});
  } catch(err) { next(err); }
});

router.get('/activity', (req, res, next) => {
  try {
    const db = getDB();
    const limit = parseInt(req.query.limit)||10;
    const logs = db.all('SELECT al.*,u.name as user_name,u.color as user_color FROM activity_logs al LEFT JOIN users u ON al.user_id=u.id ORDER BY al.created_at DESC LIMIT ?', limit);
    res.json({ success:true, data:{ activity:logs } });
  } catch(err) { next(err); }
});

router.get('/chart', (req, res, next) => {
  try {
    const db = getDB();
    const { id:uid, role } = req.user;
    let projects;
    if (role==='admin') {
      projects = db.all('SELECT id,name FROM projects ORDER BY created_at DESC LIMIT 6');
    } else {
      projects = db.all('SELECT DISTINCT p.id,p.name FROM projects p LEFT JOIN project_members pm ON p.id=pm.project_id WHERE p.owner_id=? OR pm.user_id=? ORDER BY p.created_at DESC LIMIT 6', uid, uid);
    }
    const chart = projects.map(p=>{
      const tasks = db.all('SELECT status FROM tasks WHERE project_id=?', p.id);
      return {
        name: p.name.split(' ').slice(0,2).join(' '),
        total: tasks.length,
        done: tasks.filter(t=>t.status==='done').length,
        in_progress: tasks.filter(t=>t.status==='in-progress').length,
        todo: tasks.filter(t=>t.status==='todo').length,
      };
    });
    res.json({ success:true, data:{ chart } });
  } catch(err) { next(err); }
});

module.exports = router;
