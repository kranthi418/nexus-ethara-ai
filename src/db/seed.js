require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { initDB, getDB } = require('./database');

function offset(days) {
  const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString();
}

async function seed() {
  await initDB();
  const db = getDB();
  console.log('🌱 Seeding...');

  await db.exec(`
    DELETE FROM activity_logs;
    DELETE FROM tasks;
    DELETE FROM project_members;
    DELETE FROM projects;
    DELETE FROM users;
  `);

  const users = [
    { id: uuidv4(), name: 'Arjun Mehta',  email: 'admin@nexus.io',   pw: 'admin123', role: 'admin',   color: '#f5a623' },
    { id: uuidv4(), name: 'Priya Sharma', email: 'manager@nexus.io', pw: 'mgr123',   role: 'manager', color: '#4f8ef7' },
    { id: uuidv4(), name: 'Rahul Singh',  email: 'dev@nexus.io',     pw: 'dev123',   role: 'member',  color: '#3ecf8e' },
    { id: uuidv4(), name: 'Kavya Patel',  email: 'design@nexus.io',  pw: 'des123',   role: 'member',  color: '#a78bfa' },
  ];
  for (const u of users) {
    const hash = await bcrypt.hash(u.pw, 10);
    await db.run('INSERT INTO users (id,name,email,password,role,color) VALUES (?,?,?,?,?,?)', u.id, u.name, u.email, hash, u.role, u.color);
    console.log(`  ✓ ${u.email} / ${u.pw}`);
  }

  const projects = [
    { id: uuidv4(), name: 'Ethara AI Platform',      desc: 'Core AI orchestration and inference pipeline', status: 'active',    priority: 'high',   owner: 0, members: [0,1,2], deadline: offset(20),  tags: '["AI","Backend"]' },
    { id: uuidv4(), name: 'Design System v2',         desc: 'Rebuild component library with dark mode',     status: 'active',    priority: 'medium', owner: 1, members: [1,3],   deadline: offset(14),  tags: '["Design","Frontend"]' },
    { id: uuidv4(), name: 'Client Onboarding Portal', desc: 'Self-serve portal for enterprise clients',     status: 'on-hold',   priority: 'low',    owner: 1, members: [1,2,3], deadline: offset(45),  tags: '["Portal"]' },
    { id: uuidv4(), name: 'Analytics Dashboard',      desc: 'Real-time metrics for ops team',              status: 'completed', priority: 'high',   owner: 0, members: [0,2],   deadline: offset(-5),  tags: '["Analytics"]' },
  ];
  for (const p of projects) {
    await db.run('INSERT INTO projects (id,name,description,status,priority,owner_id,deadline,tags) VALUES (?,?,?,?,?,?,?,?)', p.id, p.name, p.desc, p.status, p.priority, users[p.owner].id, p.deadline, p.tags);
    for (const mi of p.members) await db.run('INSERT INTO project_members (project_id,user_id) VALUES (?,?)', p.id, users[mi].id);
  }
  console.log(`  ✓ ${projects.length} projects`);

  const tasks = [
    { title: 'Set up model inference endpoints', proj: 0, assign: 2, status: 'done',        priority: 'high',   due: offset(-2) },
    { title: 'Design token architecture',         proj: 1, assign: 3, status: 'in-progress', priority: 'high',   due: offset(3)  },
    { title: 'Write API integration docs',        proj: 0, assign: 1, status: 'in-progress', priority: 'medium', due: offset(5)  },
    { title: 'Database schema design',            proj: 2, assign: 2, status: 'todo',        priority: 'medium', due: offset(10) },
    { title: 'Component library audit',           proj: 1, assign: 3, status: 'todo',        priority: 'low',    due: offset(8)  },
    { title: 'Set up CI/CD pipeline',             proj: 0, assign: 2, status: 'done',        priority: 'high',   due: offset(-6) },
    { title: 'User authentication flow',          proj: 2, assign: 1, status: 'in-progress', priority: 'high',   due: offset(2)  },
    { title: 'Create onboarding wireframes',      proj: 2, assign: 3, status: 'todo',        priority: 'medium', due: offset(15) },
    { title: 'Performance benchmarking',          proj: 3, assign: 0, status: 'done',        priority: 'high',   due: offset(-7) },
    { title: 'Prompt engineering experiments',    proj: 0, assign: 0, status: 'todo',        priority: 'high',   due: offset(7)  },
  ];
  for (const t of tasks) {
    await db.run('INSERT INTO tasks (id,title,project_id,assignee_id,status,priority,due_date,created_by) VALUES (?,?,?,?,?,?,?,?)',
      uuidv4(), t.title, projects[t.proj].id, users[t.assign].id, t.status, t.priority, t.due, users[0].id);
  }
  console.log(`  ✓ ${tasks.length} tasks`);

  const acts = [
    { uid: 2, action: 'completed task',  type: 'task',    name: 'Set up CI/CD pipeline' },
    { uid: 3, action: 'started task',    type: 'task',    name: 'Design token architecture' },
    { uid: 1, action: 'created project', type: 'project', name: 'Client Onboarding Portal' },
    { uid: 0, action: 'updated project', type: 'project', name: 'Ethara AI Platform' },
  ];
  for (const a of acts) {
    await db.run('INSERT INTO activity_logs (id,user_id,action,entity_type,entity_name) VALUES (?,?,?,?,?)', uuidv4(), users[a.uid].id, a.action, a.type, a.name);
  }

  console.log('\n✅ Seed complete!\n');
  console.log('  admin@nexus.io   / admin123');
  console.log('  manager@nexus.io / mgr123');
  console.log('  dev@nexus.io     / dev123');
  console.log('  design@nexus.io  / des123');
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
