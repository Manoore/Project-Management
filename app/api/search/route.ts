import { NextResponse } from "next/server";
import { ensureDatabase, sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(request: Request) {
  if (!await ensureDatabase()) return NextResponse.json({ projects: [], tasks: [] });
  const user = await getCurrentUser(request); const query = new URL(request.url).searchParams.get("q")?.trim() ?? ""; if (!query) return NextResponse.json({ projects: [], tasks: [] }); const pattern = `%${query}%`;
  const [projects, tasks] = await Promise.all([sql!`SELECT id, name, status, owner, team FROM projects WHERE archived = FALSE AND (owner = ${user.name} OR name IN (SELECT project_name FROM project_members WHERE employee_name = ${user.name})) AND (name ILIKE ${pattern} OR description ILIKE ${pattern}) LIMIT 20`, sql!`SELECT id, title, project_name AS "projectName", status, owner, priority FROM tasks WHERE project_name IN (SELECT name FROM projects WHERE archived = FALSE AND (owner = ${user.name} OR name IN (SELECT project_name FROM project_members WHERE employee_name = ${user.name}))) AND title ILIKE ${pattern} LIMIT 20`]);
  return NextResponse.json({ projects, tasks });
}

