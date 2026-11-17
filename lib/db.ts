import { neon } from "@neondatabase/serverless";
import { DEMO_ADMIN_EMAIL, DEMO_ADMIN_NAME, DEMO_ADMIN_HASH } from "./demo-admin";

export const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

let databaseReady: Promise<boolean> | null = null;
export async function ensureDatabase(): Promise<boolean> {
  if (!sql) return false;
  if (!databaseReady) databaseReady = initializeDatabase().catch(error => { databaseReady = null; throw error; });
  return databaseReady;
}

async function initializeDatabase() {
  if (!sql) return false;
  // Warm instances reuse the promise. Cold instances check one version row instead
  // of running all schema statements and seed queries on every API request.
  try {
    const ready = await sql`SELECT version FROM peopleflow_schema WHERE version = '2026-11-demo-admin-v1'`;
    if (ready.length) return true;
  } catch (error) {
    if ((error as { code?: string }).code !== '42P01') throw error;
  }
  await sql`CREATE TABLE IF NOT EXISTS employees (id SERIAL PRIMARY KEY, name TEXT NOT NULL, initials TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'Employee', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS email TEXT;`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS team TEXT NOT NULL DEFAULT 'Product';`;
  await sql`CREATE TABLE IF NOT EXISTS teams (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT, lead TEXT, archived BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`;
  await sql`CREATE TABLE IF NOT EXISTS products (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, description TEXT, owner TEXT NOT NULL DEFAULT 'Maya', team TEXT NOT NULL DEFAULT 'Product', archived BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`;
  await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS access_role TEXT NOT NULL DEFAULT 'member';`;
  await sql`CREATE TABLE IF NOT EXISTS auth_sessions (id UUID PRIMARY KEY, employee_name TEXT NOT NULL, provider TEXT NOT NULL DEFAULT 'development', expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`;
  await sql`CREATE TABLE IF NOT EXISTS password_accounts (email TEXT PRIMARY KEY, employee_name TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`;
  await sql`CREATE TABLE IF NOT EXISTS login_attempts (email TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, window_start TIMESTAMPTZ NOT NULL DEFAULT NOW());`;
  await sql`CREATE TABLE IF NOT EXISTS projects (id SERIAL PRIMARY KEY, name TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'On track', owner TEXT NOT NULL DEFAULT 'Maya', description TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`;
  await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;`;
  await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner TEXT NOT NULL DEFAULT 'Maya';`;
  await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS team TEXT NOT NULL DEFAULT 'Product';`;
  await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS product TEXT NOT NULL DEFAULT 'General';`;
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
  await sql`CREATE TABLE IF NOT EXISTS intake_forms (id SERIAL PRIMARY KEY, name TEXT NOT NULL, description TEXT, team TEXT NOT NULL DEFAULT 'Product', fields JSONB NOT NULL DEFAULT '[]'::jsonb, enabled BOOLEAN NOT NULL DEFAULT TRUE, created_by TEXT NOT NULL DEFAULT 'Maya', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`;
  await sql`CREATE TABLE IF NOT EXISTS intake_submissions (id SERIAL PRIMARY KEY, form_id INTEGER NOT NULL, submitted_by TEXT NOT NULL DEFAULT 'Maya', payload JSONB NOT NULL DEFAULT '{}'::jsonb, task_id INTEGER, status TEXT NOT NULL DEFAULT 'New', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`;
  await sql`DELETE FROM employees duplicate USING employees keeper WHERE duplicate.name = keeper.name AND duplicate.id > keeper.id`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS employees_name_unique ON employees (name)`;
  const mayaAccount = await sql`SELECT id FROM employees WHERE name = 'Maya' LIMIT 1`;
  await sql`CREATE TABLE IF NOT EXISTS ideas (id SERIAL PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'Improvement', author TEXT NOT NULL, anonymous BOOLEAN NOT NULL DEFAULT FALSE, status TEXT NOT NULL DEFAULT 'Open', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`;
  await sql`CREATE TABLE IF NOT EXISTS idea_votes (idea_id INTEGER NOT NULL REFERENCES ideas(id) ON DELETE CASCADE, employee_name TEXT NOT NULL, PRIMARY KEY (idea_id, employee_name));`;
  await sql`CREATE TABLE IF NOT EXISTS idea_comments (id SERIAL PRIMARY KEY, idea_id INTEGER NOT NULL REFERENCES ideas(id) ON DELETE CASCADE, author TEXT NOT NULL, anonymous BOOLEAN NOT NULL DEFAULT FALSE, body TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`;
  if (mayaAccount.length === 0) await sql`INSERT INTO employees (name, initials, role, team, access_role) VALUES ('Maya', 'MS', 'Product designer', 'Product', 'admin')`;
  await sql`UPDATE employees SET access_role = 'admin' WHERE name = 'Maya'`;
  try {
  const employees = await sql`SELECT id FROM employees LIMIT 1`;
  if (employees.length === 0) await sql`INSERT INTO employees (name, initials, role) VALUES ('Maya', 'MS', 'Product designer')`;
  await sql`INSERT INTO employees (name, initials, role, team, access_role) VALUES ('Riya', 'RK', 'Product manager', 'Product', 'member'), ('Arjun', 'AS', 'Engineer', 'Engineering', 'member') ON CONFLICT (name) DO NOTHING`;
  await sql`UPDATE employees SET access_role = 'admin' WHERE name = 'Maya' AND access_role = 'member'`;
  await sql`INSERT INTO teams (name, description, lead) VALUES ('Product', 'Product strategy and delivery', 'Maya'), ('Design', 'Experience and brand design', 'Riya'), ('Engineering', 'Platform and application delivery', 'Arjun'), ('Operations', 'Operations and enablement', 'Maya') ON CONFLICT (name) DO NOTHING`;
  await sql`INSERT INTO products (name, description, owner, team) VALUES ('Atlas Mobile', 'Mobile onboarding and account experience', 'Maya', 'Product'), ('Customer Insights', 'Research and customer feedback hub', 'Riya', 'Product'), ('Brand System', 'Reusable brand and marketing foundations', 'Riya', 'Design') ON CONFLICT (name) DO NOTHING`;
  const projects = await sql`SELECT id FROM projects LIMIT 1`;
  if (projects.length === 0) await sql`INSERT INTO projects (name, progress, status) VALUES ('Atlas Mobile', 82, 'On track'), ('Customer Insight Hub', 57, 'Needs review'), ('Q4 Brand Refresh', 64, 'On track')`;
  await sql`UPDATE projects SET product = CASE WHEN name = 'Atlas Mobile' THEN 'Atlas Mobile' WHEN name = 'Customer Insight Hub' THEN 'Customer Insights' WHEN name = 'Q4 Brand Refresh' THEN 'Brand System' ELSE product END WHERE product = 'General'`;
  const tasks = await sql`SELECT id FROM tasks LIMIT 1`;
  if (tasks.length === 0) await sql`INSERT INTO tasks (title, project_name, priority, status, owner, due_date) VALUES ('Review final screens with design', 'Atlas Mobile', 'High', 'In progress', 'Maya', CURRENT_DATE), ('QA handover', 'Atlas Mobile', 'High', 'Review', 'Riya', CURRENT_DATE + 2), ('Research synthesis', 'Customer Insight Hub', 'Normal', 'To do', 'Arjun', CURRENT_DATE + 4), ('Brand review', 'Q4 Brand Refresh', 'Normal', 'Done', 'Maya', CURRENT_DATE - 1)`;
  const automationRows = await sql`SELECT id FROM automation_rules LIMIT 1`;
  if (automationRows.length === 0) await sql`INSERT INTO automation_rules (name, trigger_type, conditions, actions, created_by) VALUES ('Notify owner when work is blocked', 'Task status changes', '{"status":"Blocked"}'::jsonb, '{"notifyOwner":true}'::jsonb, 'Maya'), ('Remind owners about overdue work', 'Task becomes overdue', '{}'::jsonb, '{"notifyOwner":true}'::jsonb, 'Maya')`;
  const viewRows = await sql`SELECT id FROM saved_views LIMIT 1`;
  if (viewRows.length === 0) await sql`INSERT INTO saved_views (employee_name, name, view_type, filters) VALUES ('Maya', 'My high priority work', 'My work', '{"priority":"High","status":"open"}'::jsonb), ('Maya', 'Product delivery board', 'Projects', '{"team":"Product"}'::jsonb)`;
  const goalRows = await sql`SELECT id FROM goals LIMIT 1`;
  if (goalRows.length === 0) await sql`INSERT INTO goals (title, description, owner, progress, target_date) VALUES ('Ship a calmer onboarding experience', 'Reduce friction across the mobile onboarding journey.', 'Maya', 68, CURRENT_DATE + 30), ('Improve customer feedback loop', 'Turn research signals into prioritized delivery work.', 'Riya', 42, CURRENT_DATE + 45)`;
  const milestoneRows = await sql`SELECT id FROM project_milestones LIMIT 1`;
  if (milestoneRows.length === 0) await sql`INSERT INTO project_milestones (project_name, title, due_date) VALUES ('Atlas Mobile', 'QA handover', CURRENT_DATE + 7), ('Customer Insight Hub', 'Research synthesis review', CURRENT_DATE + 12)`;
  const riskRows = await sql`SELECT id FROM project_risks LIMIT 1`;
  if (riskRows.length === 0) await sql`INSERT INTO project_risks (project_name, title, severity, owner, mitigation) VALUES ('Customer Insight Hub', 'Research synthesis is waiting on interviews', 'Medium', 'Riya', 'Reserve a review block with the research team')`;
  const checkinRows = await sql`SELECT id FROM checkins LIMIT 1`;
  if (checkinRows.length === 0) await sql`INSERT INTO checkins (employee_name, mood) VALUES ('Maya', '😊'), ('Riya', '🙂'), ('Arjun', '⚡')`;
  const timeRows = await sql`SELECT id FROM time_entries LIMIT 1`;
  if (timeRows.length === 0) await sql`INSERT INTO time_entries (employee_name, clocked_in_at, clocked_out_at) VALUES ('Maya', CURRENT_DATE + TIME '09:02', CURRENT_DATE + TIME '17:18'), ('Riya', CURRENT_DATE + TIME '09:18', CURRENT_DATE + TIME '17:02')`;
  const intakeRows = await sql`SELECT id FROM intake_forms LIMIT 1`;
  if (intakeRows.length === 0) await sql`INSERT INTO intake_forms (name, description, team, fields) VALUES ('Product improvement', 'Request a customer-facing product improvement.', 'Product', '[{"key":"summary","label":"What should change?"}]'::jsonb), ('Design review', 'Ask the design team for a review or critique.', 'Design', '[{"key":"summary","label":"What needs review?"}]'::jsonb)`;
  await sql`CREATE TABLE IF NOT EXISTS demo_seed_versions (version TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`;
  await sql`WITH first_run AS (INSERT INTO demo_seed_versions (version) VALUES ('delivery-demo-v1') ON CONFLICT DO NOTHING RETURNING version), sample_project AS (INSERT INTO projects (name, description, owner, team, product, progress) SELECT 'Demo · Employee experience', 'Sample project for testing delivery flows. Demo data.', 'Maya', 'Product', 'Atlas Mobile', 25 WHERE EXISTS (SELECT 1 FROM first_run) RETURNING name), memberships AS (INSERT INTO project_members (project_name, employee_name, role) SELECT name, 'Maya', 'Owner' FROM sample_project ON CONFLICT DO NOTHING) INSERT INTO tasks (title, project_name, owner, priority, status, completed, due_date, estimate_minutes) SELECT title, name, owner, priority, status, completed, CURRENT_DATE + days, 90 FROM sample_project CROSS JOIN (VALUES ('Map the employee onboarding journey', 'Maya', 'High', 'To do', FALSE, 3), ('Build the welcome checklist', 'Arjun', 'Normal', 'In progress', FALSE, 5), ('Review accessibility and copy', 'Riya', 'High', 'Review', FALSE, 1), ('Agree on success measures', 'Maya', 'Normal', 'Done', TRUE, -1)) AS samples(title, owner, priority, status, completed, days)`;
  await sql`WITH first_run AS (INSERT INTO demo_seed_versions (version) VALUES ('idea-board-v1') ON CONFLICT DO NOTHING RETURNING version) INSERT INTO ideas (title, body, category, author, anonymous) SELECT title, body, category, author, anonymous FROM (VALUES ('Protect a weekly focus afternoon', 'Try one meeting-free afternoon each week and review whether it helps us finish priority work.', 'Culture', 'Maya', FALSE), ('Make handovers easier to follow', 'Use a short handover checklist with an owner, due date, and acceptance criteria for every review.', 'Process', 'Riya', TRUE), ('Show customer impact on project cards', 'Add a short customer outcome to project descriptions so the team understands why the work matters.', 'Product', 'Arjun', FALSE)) AS samples(title, body, category, author, anonymous) WHERE EXISTS (SELECT 1 FROM first_run)`;
  } catch (error) {
    console.error("Demo seed failed", error);
    // Demo seed data is best-effort. A seed mismatch must not take down the API.
  }
  await sql`CREATE TABLE IF NOT EXISTS peopleflow_schema (version TEXT PRIMARY KEY)`;
  if (process.env.ENABLE_DEMO_ADMIN !== 'false') {
    await sql`CREATE TABLE IF NOT EXISTS demo_seed_versions (version TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
    // Do not replace an existing account, promote another user, or reset a password.
    await sql`WITH first_run AS (INSERT INTO demo_seed_versions (version) VALUES ('demo-admin-v1') ON CONFLICT DO NOTHING RETURNING version), employee AS (INSERT INTO employees (name, initials, email, role, team, access_role) SELECT ${DEMO_ADMIN_NAME}, 'DA', ${DEMO_ADMIN_EMAIL}, 'Demo administrator', 'Product', 'admin' WHERE EXISTS (SELECT 1 FROM first_run) AND NOT EXISTS (SELECT 1 FROM password_accounts WHERE email = ${DEMO_ADMIN_EMAIL}) AND NOT EXISTS (SELECT 1 FROM employees WHERE name = ${DEMO_ADMIN_NAME}) ON CONFLICT DO NOTHING RETURNING name) INSERT INTO password_accounts (email, employee_name, password_hash) SELECT ${DEMO_ADMIN_EMAIL}, name, ${DEMO_ADMIN_HASH} FROM employee ON CONFLICT DO NOTHING`;
  }
  await sql`INSERT INTO peopleflow_schema (version) VALUES ('2026-11-demo-admin-v1') ON CONFLICT DO NOTHING`;
  return true;
}


