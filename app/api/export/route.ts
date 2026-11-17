import { NextResponse } from "next/server";
import { ensureDatabase, sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(request: Request) { if (!await ensureDatabase()) return NextResponse.json({ projects: [], tasks: [] }); const user = await getCurrentUser(request); const [projects, tasks] = await Promise.all([sql!`SELECT id, name, status, owner, team, health, progress, start_date AS "startDate", target_date AS "targetDate" FROM projects WHERE archived = FALSE AND (owner = ${user.name} OR name IN (SELECT project_name FROM project_members WHERE employee_name = ${user.name})) ORDER BY id`, sql!`SELECT id, title, project_name AS "projectName", status, owner, priority, due_date AS "dueDate", start_date AS "startDate", completed FROM tasks WHERE project_name IN (SELECT name FROM projects WHERE archived = FALSE AND (owner = ${user.name} OR name IN (SELECT project_name FROM project_members WHERE employee_name = ${user.name}))) ORDER BY id`]); return NextResponse.json({ generatedAt: new Date().toISOString(), projects, tasks }); }

