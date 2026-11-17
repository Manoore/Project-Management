import type { CurrentUser } from './auth';
import { sql } from './db';
export async function canAccessTask(user: CurrentUser, id: number, write = false) {
  if (!sql || !Number.isSafeInteger(id) || id < 1 || (write && user.accessRole === 'viewer')) return false;
  const rows = await sql`SELECT id FROM tasks WHERE id = ${id} AND ((project_name = 'General' AND owner = ${user.name}) OR project_name IN (SELECT name FROM projects WHERE NOT archived AND (owner = ${user.name} OR name IN (SELECT project_name FROM project_members WHERE employee_name = ${user.name}))))`;
  return rows.length > 0;
}

