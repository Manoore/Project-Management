import { NextResponse } from "next/server";
import { ensureDatabase, sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!await ensureDatabase()) return NextResponse.json({ projects: [], tasks: [], workload: [] });
  const [projects, tasks, workload] = await Promise.all([
    sql!`SELECT status, COUNT(*)::int AS count FROM projects WHERE NOT archived AND (owner = ${user.name} OR name IN (SELECT project_name FROM project_members WHERE employee_name = ${user.name})) GROUP BY status ORDER BY status`,
    sql!`SELECT status, COUNT(*)::int AS count, COUNT(*) FILTER (WHERE completed)::int AS completed FROM tasks WHERE (project_name = 'General' AND owner = ${user.name}) OR project_name IN (SELECT name FROM projects WHERE NOT archived AND (owner = ${user.name} OR name IN (SELECT project_name FROM project_members WHERE employee_name = ${user.name}))) GROUP BY status ORDER BY status`,
    sql!`SELECT owner, COUNT(*)::int AS open_tasks FROM tasks WHERE completed = FALSE AND ((project_name = 'General' AND owner = ${user.name}) OR project_name IN (SELECT name FROM projects WHERE NOT archived AND (owner = ${user.name} OR name IN (SELECT project_name FROM project_members WHERE employee_name = ${user.name})))) GROUP BY owner ORDER BY open_tasks DESC`,
  ]);
  return NextResponse.json({ projects, tasks, workload, generatedAt: new Date().toISOString() });
}

