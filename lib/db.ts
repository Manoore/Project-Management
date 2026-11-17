import { neon } from "@neondatabase/serverless";

export const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

export async function ensureDatabase() {
  if (!sql) return false;
  await sql`CREATE TABLE IF NOT EXISTS employees (id SERIAL PRIMARY KEY, name TEXT NOT NULL, initials TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'Employee', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS email TEXT;`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS team TEXT NOT NULL DEFAULT 'Product';`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS access_role TEXT NOT NULL DEFAULT 'member';`;
  await sql`CREATE TABLE IF NOT EXISTS auth_sessions (id UUID PRIMARY KEY, employee_name TEXT NOT NULL, provider TEXT NOT NULL DEFAULT 'development', expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`;
  await sql`CREATE TABLE IF NOT EXISTS projects (id SERIAL PRIMARY KEY, name TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'On track', owner TEXT NOT NULL DEFAULT 'Maya', description TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`;
  await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;`;
  await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner TEXT NOT NULL DEFAULT 'Maya';`;
  await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS team TEXT NOT NULL DEFAULT 'Product';`;
  await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS description TEXT;`;
  await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS start_date DATE;`;
  await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS target_date DATE;`;
  await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS health TEXT NOT NULL DEFAULT 'On track';`;
  await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS budget NUMERIC(12,2);`;
  await sql`CREATE TABLE IF NOT EXISTS tasks (id SERIAL PRIMARY KEY, title TEXT NOT NULL, project_name TEXT NOT NULL DEFAULT 'General', completed BOOLEAN NOT NULL DEFAULT FALSE, priority TEXT NOT NULL DEFAULT 'Normal', status TEXT NOT NULL DEFAULT 'To do', owner TEXT NOT NULL DEFAULT 'Maya', due_date DATE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`;
  await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'To do';`;
  await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS owner TEXT NOT NULL DEFAULT 'Maya';`;
  await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date DATE;`;
  await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`;
  await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_type TEXT NOT NULL DEFAULT 'Task';`;
  await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_date DATE;`;
  await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimate_minutes INTEGER;`;
  await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS recurring_rule TEXT;`;
  await sql`CREATE TABLE IF NOT EXISTS checkins (id SERIAL PRIMARY KEY, employee_name TEXT NOT NULL, mood TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`;
  await sql`CREATE TABLE IF NOT EXISTS time_entries (id SERIAL PRIMARY KEY, employee_name TEXT NOT NULL, clocked_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), clocked_out_at TIMESTAMPTZ);`;
  await sql`CREATE TABLE IF NOT EXISTS activity_events (id SERIAL PRIMARY KEY, employee_name TEXT NOT NULL, event_type TEXT NOT NULL, message TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`;
  await sql`CREATE TABLE IF NOT EXISTS notifications (id SERIAL PRIMARY KEY, employee_name TEXT NOT NULL, type TEXT NOT NULL, message TEXT NOT NULL, read BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`;
  await sql`CREATE TABLE IF NOT EXISTS project_members (id SERIAL PRIMARY KEY, project_name TEXT NOT NULL, employee_name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'Contributor', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(project_name, employee_name));`;
  await sql`CREATE TABLE IF NOT EXISTS subtasks (id SERIAL PRIMARY KEY, task_id INTEGER NOT NULL, title TEXT NOT NULL, completed BOOLEAN NOT NULL DEFAULT FALSE, owner TEXT NOT NULL DEFAULT 'Maya', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`;
  await sql`CREATE TABLE IF NOT EXISTS task_comments (id SERIAL PRIMARY KEY, task_id INTEGER NOT NULL, employee_name TEXT NOT NULL, body TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`;
  await sql`CREATE TABLE IF NOT EXISTS task_dependencies (id SERIAL PRIMARY KEY, task_id INTEGER NOT NULL, depends_on_task_id INTEGER NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(task_id, depends_on_task_id));`;
  await sql`CREATE TABLE IF NOT EXISTS task_tags (id SERIAL PRIMARY KEY, task_id INTEGER NOT NULL, tag TEXT NOT NULL, UNIQUE(task_id, tag));`;
  await sql`CREATE TABLE IF NOT EXISTS task_watchers (id SERIAL PRIMARY KEY, task_id INTEGER NOT NULL, employee_name TEXT NOT NULL, UNIQUE(task_id, employee_name));`;
  await sql`CREATE TABLE IF NOT EXISTS task_custom_fields (id SERIAL PRIMARY KEY, task_id INTEGER NOT NULL, field_key TEXT NOT NULL, field_value TEXT, UNIQUE(task_id, field_key));`;
  await sql`CREATE TABLE IF NOT EXISTS project_milestones (id SERIAL PRIMARY KEY, project_name TEXT NOT NULL, title TEXT NOT NULL, due_date DATE, completed BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`;
  await sql`CREATE TABLE IF NOT EXISTS project_risks (id SERIAL PRIMARY KEY, project_name TEXT NOT NULL, title TEXT NOT NULL, severity TEXT NOT NULL DEFAULT 'Medium', owner TEXT NOT NULL DEFAULT 'Maya', status TEXT NOT NULL DEFAULT 'Open', mitigation TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`;
  await sql`CREATE TABLE IF NOT EXISTS goals (id SERIAL PRIMARY KEY, title TEXT NOT NULL, description TEXT, owner TEXT NOT NULL DEFAULT 'Maya', status TEXT NOT NULL DEFAULT 'Active', progress INTEGER NOT NULL DEFAULT 0, target_date DATE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`;
  await sql`CREATE TABLE IF NOT EXISTS goal_projects (id SERIAL PRIMARY KEY, goal_id INTEGER NOT NULL, project_name TEXT NOT NULL, UNIQUE(goal_id, project_name));`;
  await sql`CREATE TABLE IF NOT EXISTS project_templates (id SERIAL PRIMARY KEY, name TEXT NOT NULL, description TEXT, definition JSONB NOT NULL DEFAULT '{}'::jsonb, created_by TEXT NOT NULL DEFAULT 'Maya', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`;
  await sql`CREATE TABLE IF NOT EXISTS saved_views (id SERIAL PRIMARY KEY, employee_name TEXT NOT NULL, name TEXT NOT NULL, view_type TEXT NOT NULL, filters JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(employee_name, name));`;
  await sql`CREATE TABLE IF NOT EXISTS automation_rules (id SERIAL PRIMARY KEY, name TEXT NOT NULL, trigger_type TEXT NOT NULL, conditions JSONB NOT NULL DEFAULT '{}'::jsonb, actions JSONB NOT NULL DEFAULT '{}'::jsonb, enabled BOOLEAN NOT NULL DEFAULT TRUE, created_by TEXT NOT NULL DEFAULT 'Maya', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`;
  await sql`CREATE TABLE IF NOT EXISTS audit_logs (id SERIAL PRIMARY KEY, employee_name TEXT NOT NULL, action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT, details JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`;
  await sql`CREATE TABLE IF NOT EXISTS notification_preferences (employee_name TEXT PRIMARY KEY, in_app BOOLEAN NOT NULL DEFAULT TRUE, email BOOLEAN NOT NULL DEFAULT FALSE, daily_digest BOOLEAN NOT NULL DEFAULT TRUE, due_reminders BOOLEAN NOT NULL DEFAULT TRUE, quiet_hours JSONB NOT NULL DEFAULT '{}'::jsonb);`;
  await sql`CREATE TABLE IF NOT EXISTS integration_webhooks (id SERIAL PRIMARY KEY, name TEXT NOT NULL, endpoint TEXT NOT NULL, events JSONB NOT NULL DEFAULT '[]'::jsonb, enabled BOOLEAN NOT NULL DEFAULT TRUE, created_by TEXT NOT NULL DEFAULT 'Maya', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`;
  await sql`CREATE TABLE IF NOT EXISTS task_attachments (id SERIAL PRIMARY KEY, task_id INTEGER NOT NULL, file_name TEXT NOT NULL, file_url TEXT NOT NULL, uploaded_by TEXT NOT NULL DEFAULT 'Maya', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`;
  const employees = await sql`SELECT id FROM employees LIMIT 1`;
  if (employees.length === 0) await sql`INSERT INTO employees (name, initials, role) VALUES ('Maya', 'MS', 'Product designer')`;
  await sql`UPDATE employees SET access_role = 'admin' WHERE name = 'Maya' AND access_role = 'member'`;
  const projects = await sql`SELECT id FROM projects LIMIT 1`;
  if (projects.length === 0) await sql`INSERT INTO projects (name, progress, status) VALUES ('Atlas Mobile', 82, 'On track'), ('Customer Insight Hub', 57, 'Needs review'), ('Q4 Brand Refresh', 64, 'On track')`;
  const tasks = await sql`SELECT id FROM tasks LIMIT 1`;
  if (tasks.length === 0) await sql`INSERT INTO tasks (title, project_name, priority, status, owner, due_date) VALUES ('Review final screens with design', 'Atlas Mobile', 'High', 'In progress', 'Maya', CURRENT_DATE), ('QA handover', 'Atlas Mobile', 'High', 'Review', 'Riya', CURRENT_DATE + 2), ('Research synthesis', 'Customer Insight Hub', 'Normal', 'To do', 'Arjun', CURRENT_DATE + 4), ('Brand review', 'Q4 Brand Refresh', 'Normal', 'Done', 'Maya', CURRENT_DATE - 1)`;
  return true;
}


