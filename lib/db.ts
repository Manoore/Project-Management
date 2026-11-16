import { neon } from "@neondatabase/serverless";

export const sql = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;

export async function ensureDatabase() {
  if (!sql) return false;
  await sql`CREATE TABLE IF NOT EXISTS employees (id SERIAL PRIMARY KEY, name TEXT NOT NULL, initials TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'Employee', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`;
  await sql`CREATE TABLE IF NOT EXISTS projects (id SERIAL PRIMARY KEY, name TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'On track', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`;
  await sql`CREATE TABLE IF NOT EXISTS tasks (id SERIAL PRIMARY KEY, title TEXT NOT NULL, project_name TEXT NOT NULL DEFAULT 'General', completed BOOLEAN NOT NULL DEFAULT FALSE, priority TEXT NOT NULL DEFAULT 'Normal', status TEXT NOT NULL DEFAULT 'To do', owner TEXT NOT NULL DEFAULT 'Maya', due_date DATE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`;
  await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'To do';`;
  await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS owner TEXT NOT NULL DEFAULT 'Maya';`;
  await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date DATE;`;
  await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`;
  await sql`CREATE TABLE IF NOT EXISTS checkins (id SERIAL PRIMARY KEY, employee_name TEXT NOT NULL, mood TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`;
  await sql`CREATE TABLE IF NOT EXISTS time_entries (id SERIAL PRIMARY KEY, employee_name TEXT NOT NULL, clocked_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), clocked_out_at TIMESTAMPTZ);`;
  await sql`CREATE TABLE IF NOT EXISTS leave_requests (id SERIAL PRIMARY KEY, employee_name TEXT NOT NULL, leave_type TEXT NOT NULL, start_date DATE NOT NULL, end_date DATE NOT NULL, reason TEXT, status TEXT NOT NULL DEFAULT 'Pending', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`;
  await sql`CREATE TABLE IF NOT EXISTS meetings (id SERIAL PRIMARY KEY, title TEXT NOT NULL, starts_at TIMESTAMPTZ NOT NULL, duration_minutes INTEGER NOT NULL DEFAULT 30, attendees TEXT[] NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`;
  await sql`CREATE TABLE IF NOT EXISTS activity_events (id SERIAL PRIMARY KEY, employee_name TEXT NOT NULL, event_type TEXT NOT NULL, message TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`;
  await sql`CREATE TABLE IF NOT EXISTS notifications (id SERIAL PRIMARY KEY, employee_name TEXT NOT NULL, type TEXT NOT NULL, message TEXT NOT NULL, read BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`;
  const employees = await sql`SELECT id FROM employees LIMIT 1`;
  if (employees.length === 0) await sql`INSERT INTO employees (name, initials, role) VALUES ('Maya', 'MS', 'Product designer')`;
  const projects = await sql`SELECT id FROM projects LIMIT 1`;
  if (projects.length === 0) await sql`INSERT INTO projects (name, progress, status) VALUES ('Atlas Mobile', 82, 'On track'), ('Customer Insight Hub', 57, 'Needs review'), ('Q4 Brand Refresh', 64, 'On track')`;
  const tasks = await sql`SELECT id FROM tasks LIMIT 1`;
  if (tasks.length === 0) await sql`INSERT INTO tasks (title, project_name, priority, status, owner, due_date) VALUES ('Review final screens with design', 'Atlas Mobile', 'High', 'In progress', 'Maya', CURRENT_DATE), ('QA handover', 'Atlas Mobile', 'High', 'Review', 'Riya', CURRENT_DATE + 2), ('Research synthesis', 'Customer Insight Hub', 'Normal', 'To do', 'Arjun', CURRENT_DATE + 4), ('Brand review', 'Q4 Brand Refresh', 'Normal', 'Done', 'Maya', CURRENT_DATE - 1)`;
  return true;
}
