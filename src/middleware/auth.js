const jwt = require('jsonwebtoken');
const { getDB } = require('../db/database');

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const db = getDB();
    const user = db.prepare('SELECT id, name, email, role, color, created_at FROM users WHERE id = ?').get(decoded.id);
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: `Access denied. Required role: ${roles.join(' or ')}` });
  }
  next();
};

const requireProjectAccess = (req, res, next) => {
  const { id } = req.params;
  const db = getDB();
  if (req.user.role === 'admin') return next();
  const member = db.prepare('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?').get(id, req.user.id);
  const owner = db.prepare('SELECT 1 FROM projects WHERE id = ? AND owner_id = ?').get(id, req.user.id);
  if (!member && !owner) return res.status(403).json({ success: false, message: 'Access denied to this project' });
  next();
};

module.exports = { authenticate, requireRole, requireProjectAccess };
