const express = require('express');
const { body } = require('express-validator');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDB } = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/errorHandler');

const router = express.Router();
router.use(authenticate);

function enrichUser(db, u) {
  u.open_tasks = (db.get("SELECT COUNT(*) as c FROM tasks WHERE assignee_id=? AND status!='done'", u.id)||{c:0}).c;
  u.total_tasks = (db.get('SELECT COUNT(*) as c FROM tasks WHERE assignee_id=?', u.id)||{c:0}).c;
  u.project_count = (db.get('SELECT COUNT(DISTINCT p.id) as c FROM projects p LEFT JOIN project_members pm ON p.id=pm.project_id WHERE p.owner_id=? OR pm.user_id=?', u.id, u.id)||{c:0}).c;
  return u;
}

router.get('/', (req, res, next) => {
  try {
    const db = getDB();
    const users = db.all('SELECT id,name,email,role,color,created_at FROM users ORDER BY created_at ASC');
    res.json({ success:true, data:{ users: users.map(u=>enrichUser(db,u)), total:users.length } });
  } catch(err) { next(err); }
});

router.get('/:id', (req, res, next) => {
  try {
    const db = getDB();
    const user = db.get('SELECT id,name,email,role,color,created_at FROM users WHERE id=?', req.params.id);
    if (!user) return res.status(404).json({ success:false, message:'User not found' });
    res.json({ success:true, data:{ user: enrichUser(db,user) } });
  } catch(err) { next(err); }
});

router.post('/', requireRole('admin'), [
  body('name').trim().notEmpty().isLength({min:2,max:60}),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({min:6}),
  body('role').isIn(['admin','manager','member']),
], validate, async (req,res,next) => {
  try {
    const { name, email, password, role, color='#f5a623' } = req.body;
    const db = getDB();
    if (db.get('SELECT id FROM users WHERE email=?',email)) return res.status(409).json({success:false,message:'Email already registered'});
    const id = uuidv4();
    db.run('INSERT INTO users (id,name,email,password,role,color) VALUES (?,?,?,?,?,?)', id, name, email, await bcrypt.hash(password,10), role, color);
    const user = db.get('SELECT id,name,email,role,color,created_at FROM users WHERE id=?', id);
    res.status(201).json({ success:true, data:{ user } });
  } catch(err) { next(err); }
});

router.put('/:id', [
  body('name').optional().trim().notEmpty().isLength({max:60}),
  body('role').optional().isIn(['admin','manager','member']),
], validate, async (req,res,next) => {
  try {
    const db = getDB();
    if (req.user.role!=='admin' && req.user.id!==req.params.id) return res.status(403).json({success:false,message:'Cannot edit other users'});
    if (req.body.role && req.user.role!=='admin') return res.status(403).json({success:false,message:'Only admin can change roles'});
    if (!db.get('SELECT id FROM users WHERE id=?', req.params.id)) return res.status(404).json({success:false,message:'User not found'});
    const fields=[], vals=[];
    if (req.body.name)  { fields.push('name=?');  vals.push(req.body.name); }
    if (req.body.role)  { fields.push('role=?');  vals.push(req.body.role); }
    if (req.body.color) { fields.push('color=?'); vals.push(req.body.color); }
    if (!fields.length) return res.json({success:true, message:'Nothing to update'});
    fields.push('updated_at=?'); vals.push(new Date().toISOString());
    db.run(`UPDATE users SET ${fields.join(',')} WHERE id=?`, ...vals, req.params.id);
    const user = db.get('SELECT id,name,email,role,color,created_at FROM users WHERE id=?', req.params.id);
    res.json({ success:true, data:{ user } });
  } catch(err) { next(err); }
});

router.delete('/:id', requireRole('admin'), (req,res,next) => {
  try {
    const db = getDB();
    if (req.params.id===req.user.id) return res.status(400).json({success:false,message:"Cannot delete your own account"});
    if (!db.get('SELECT id FROM users WHERE id=?', req.params.id)) return res.status(404).json({success:false,message:'User not found'});
    db.run('DELETE FROM users WHERE id=?', req.params.id);
    res.json({ success:true, message:'User deleted' });
  } catch(err) { next(err); }
});

module.exports = router;
