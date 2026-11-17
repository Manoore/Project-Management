import type { CurrentUser } from './auth';
import { sql } from './db';
export type VisibleProject = { id: number; name: string; owner: string };
export async function getVisibleProject(user: CurrentUser, id: number): Promise<VisibleProject | null> {
  if (!sql || !Number.isSafeInteger(id) || id < 1) return null;
  const rows = await sql`SELECT id, name, owner FROM projects WHERE id = ${id} AND NOT archived AND (owner = ${user.name} OR name IN (SELECT project_name FROM project_members WHERE employee_name = ${user.name})) LIMIT 1`;
  return rows[0] as VisibleProject | undefined ?? null;
}
