require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { body } = require('express-validator');
const { getDB } = require('../db/database');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/errorHandler');

const router = express.Router();
const COLORS = ['#f5a623','#4f8ef7','#3ecf8e','#a78bfa','#f05252','#14b8a6'];

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN||'7d' });
}

// POST /api/auth/register
router.post('/register', [
  body('name').trim().notEmpty().withMessage('Name required').isLength({min:2,max:60}),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({min:6}).withMessage('Password must be at least 6 characters'),
  body('role').optional().isIn(['member','manager']),
], validate, async (req, res, next) => {
  try {
    const { name, email, password, role='member' } = req.body;
    const db = getDB();
    if (db.get('SELECT id FROM users WHERE email=?', email))
      return res.status(409).json({ success:false, message:'Email already registered' });
    const hash = await bcrypt.hash(password, 10);
    const id = uuidv4();
    const color = COLORS[Math.floor(Math.random()*COLORS.length)];
    db.run('INSERT INTO users (id,name,email,password,role,color) VALUES (?,?,?,?,?,?)', id, name, email, hash, role, color);
    db.run('INSERT INTO activity_logs (id,user_id,action,entity_type,entity_name) VALUES (?,?,?,?,?)', uuidv4(), id, 'joined the workspace', 'user', name);
    const user = db.get('SELECT id,name,email,role,color,created_at FROM users WHERE id=?', id);
    res.status(201).json({ success:true, data:{ token:signToken(user), user } });
  } catch(err) { next(err); }
});

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], validate, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const db = getDB();
    const user = db.get('SELECT * FROM users WHERE email=?', email);
    if (!user) return res.status(401).json({ success:false, message:'Invalid email or password' });
    if (!await bcrypt.compare(password, user.password))
      return res.status(401).json({ success:false, message:'Invalid email or password' });
    db.run('INSERT INTO activity_logs (id,user_id,action,entity_type,entity_name) VALUES (?,?,?,?,?)', uuidv4(), user.id, 'logged in', 'user', user.name);
    const { password:_, ...safe } = user;
    res.json({ success:true, data:{ token:signToken(safe), user:safe } });
  } catch(err) { next(err); }
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  res.json({ success:true, data:{ user:req.user } });
});

// PUT /api/auth/profile
router.put('/profile', authenticate, [
  body('name').optional().trim().notEmpty().isLength({max:60}),
  body('email').optional().isEmail().normalizeEmail(),
  body('password').optional().isLength({min:6}),
], validate, async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    const db = getDB();
    if (email) {
      const ex = db.get('SELECT id FROM users WHERE email=?', email);
      if (ex && ex.id !== req.user.id) return res.status(409).json({ success:false, message:'Email already in use' });
    }
    const fields = [], vals = [];
    if (name)     { fields.push('name=?');     vals.push(name); }
    if (email)    { fields.push('email=?');    vals.push(email); }
    if (password) { fields.push('password=?'); vals.push(await bcrypt.hash(password,10)); }
    fields.push('updated_at=?'); vals.push(new Date().toISOString());
    if (fields.length > 1) db.run(`UPDATE users SET ${fields.join(',')} WHERE id=?`, ...vals, req.user.id);
    const user = db.get('SELECT id,name,email,role,color,created_at FROM users WHERE id=?', req.user.id);
    res.json({ success:true, data:{ user } });
  } catch(err) { next(err); }
});

module.exports = router;
