require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

function offsetDate(days) {
  const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString();
}

async function seed() {
  const { initDB } = require('./database');
  const db = await initDB();
  console.log('🌱 Seeding database...');

  db.exec(`DELETE FROM activity_logs; DELETE FROM tasks; DELETE FROM project_members; DELETE FROM projects; DELETE FROM users;`);

  const users = [
    { id: uuidv4(), name: 'Arjun Mehta',  email: 'admin@nexus.io',   password: 'admin123', role: 'admin',   color: '#f5a623' },
    { id: uuidv4(), name: 'Priya Sharma', email: 'manager@nexus.io', password: 'mgr123',   role: 'manager', color: '#4f8ef7' },
    { id: uuidv4(), name: 'Rahul Singh',  email: 'dev@nexus.io',     password: 'dev123',   role: 'member',  color: '#3ecf8e' },
    { id: uuidv4(), name: 'Kavya Patel',  email: 'design@nexus.io',  password: 'des123',   role: 'member',  color: '#a78bfa' },
  ];
  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 10);
    db.run('INSERT INTO users (id,name,email,password,role,color,created_at) VALUES (?,?,?,?,?,?,?)',
      u.id, u.name, u.email, hash, u.role, u.color, offsetDate(-30));
    console.log(`  ✓ ${u.email} / ${u.password}`);
  }

  const projects = [
    { id: uuidv4(), name: 'Ethara AI Platform',      desc: 'Core AI orchestration and inference pipeline',               status: 'active',    priority: 'high',   owner: 0, members: [0,1,2], deadline: offsetDate(20),  tags: '["AI","Backend","ML"]',          ca: offsetDate(-28) },
    { id: uuidv4(), name: 'Design System v2',         desc: 'Rebuild component library with dark mode and accessibility', status: 'active',    priority: 'medium', owner: 1, members: [1,3],   deadline: offsetDate(14),  tags: '["Design","Frontend"]',          ca: offsetDate(-15) },
    { id: uuidv4(), name: 'Client Onboarding Portal', desc: 'Self-serve portal for enterprise clients',                  status: 'on-hold',   priority: 'low',    owner: 1, members: [1,2,3], deadline: offsetDate(45),  tags: '["Portal","Enterprise"]',        ca: offsetDate(-10) },
    { id: uuidv4(), name: 'Analytics Dashboard',      desc: 'Real-time metrics and reporting for ops team',              status: 'completed', priority: 'high',   owner: 0, members: [0,2],   deadline: offsetDate(-5),  tags: '["Analytics","Data"]',           ca: offsetDate(-50) },
  ];
  for (const p of projects) {
    db.run('INSERT INTO projects (id,name,description,status,priority,owner_id,deadline,tags,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      p.id, p.name, p.desc, p.status, p.priority, users[p.owner].id, p.deadline, p.tags, p.ca);
    for (const mi of p.members)
      db.run('INSERT OR IGNORE INTO project_members (project_id,user_id) VALUES (?,?)', p.id, users[mi].id);
  }
  console.log(`  ✓ ${projects.length} projects`);

  const tasks = [
    { title: 'Set up model inference endpoints', desc: 'Configure FastAPI for GPT model serving', proj: 0, assign: 2, status: 'done',        priority: 'high',   due: offsetDate(-2),  ca: offsetDate(-20) },
    { title: 'Design token architecture',         desc: 'Define spacing, color, typography tokens', proj: 1, assign: 3, status: 'in-progress', priority: 'high',   due: offsetDate(3),   ca: offsetDate(-12) },
    { title: 'Write API integration docs',        desc: 'Document REST endpoints with Swagger',    proj: 0, assign: 1, status: 'in-progress', priority: 'medium', due: offsetDate(5),   ca: offsetDate(-18) },
    { title: 'Database schema design',            desc: 'ERD for client onboarding data',          proj: 2, assign: 2, status: 'todo',        priority: 'medium', due: offsetDate(10),  ca: offsetDate(-8)  },
    { title: 'Component library audit',           desc: 'Audit existing components for reuse',     proj: 1, assign: 3, status: 'todo',        priority: 'low',    due: offsetDate(8),   ca: offsetDate(-11) },
    { title: 'Set up CI/CD pipeline',             desc: 'GitHub Actions for staging and prod',     proj: 0, assign: 2, status: 'done',        priority: 'high',   due: offsetDate(-6),  ca: offsetDate(-25) },
    { title: 'User authentication flow',          desc: 'JWT + refresh token implementation',      proj: 2, assign: 1, status: 'in-progress', priority: 'high',   due: offsetDate(2),   ca: offsetDate(-7)  },
    { title: 'Create onboarding wireframes',      desc: 'Lo-fi wireframes for 5 screens in Figma', proj: 2, assign: 3, status: 'todo',        priority: 'medium', due: offsetDate(15),  ca: offsetDate(-6)  },
    { title: 'Performance benchmarking',          desc: 'Load test with 10k concurrent users',     proj: 3, assign: 0, status: 'done',        priority: 'high',   due: offsetDate(-7),  ca: offsetDate(-45) },
    { title: 'Prompt engineering experiments',    desc: 'Test prompt strategies for summarization',proj: 0, assign: 0, status: 'todo',        priority: 'high',   due: offsetDate(7),   ca: offsetDate(-3)  },
  ];
  for (const t of tasks) {
    db.run('INSERT INTO tasks (id,title,description,project_id,assignee_id,status,priority,due_date,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      uuidv4(), t.title, t.desc, projects[t.proj].id, users[t.assign].id, t.status, t.priority, t.due, users[0].id, t.ca);
  }
  console.log(`  ✓ ${tasks.length} tasks`);

  const acts = [
    { uid: 2, action: 'completed task',    type: 'task',    name: 'Set up CI/CD pipeline',         ca: offsetDate(-1)  },
    { uid: 3, action: 'started task',      type: 'task',    name: 'Design token architecture',     ca: offsetDate(-2)  },
    { uid: 1, action: 'created project',   type: 'project', name: 'Client Onboarding Portal',     ca: offsetDate(-10) },
    { uid: 0, action: 'updated priority',  type: 'project', name: 'Ethara AI Platform',           ca: offsetDate(-15) },
  ];
  for (const a of acts)
    db.run('INSERT INTO activity_logs (id,user_id,action,entity_type,entity_name,created_at) VALUES (?,?,?,?,?,?)',
      uuidv4(), users[a.uid].id, a.action, a.type, a.name, a.ca);

  console.log('\n✅ Seed complete!\n');
  console.log('Credentials:');
  console.log('  admin@nexus.io   / admin123  (Admin)');
  console.log('  manager@nexus.io / mgr123    (Manager)');
  console.log('  dev@nexus.io     / dev123    (Member)');
  console.log('  design@nexus.io  / des123    (Member)');
  process.exit(0);
}
seed().catch(e => { console.error(e); process.exit(1); });
