import { NextResponse } from "next/server";
import { ensureDatabase, sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(request: Request) {
  if (!await ensureDatabase()) return NextResponse.json([]);
  const user = await getCurrentUser(request); const from = new URL(request.url).searchParams.get("from"); const to = new URL(request.url).searchParams.get("to");
  return NextResponse.json(await sql!`SELECT id, title, project_name AS "projectName", status, owner, priority, start_date AS "startDate", due_date AS "dueDate", estimate_minutes AS "estimateMinutes", completed FROM tasks WHERE (owner = ${user.name} OR project_name IN (SELECT name FROM projects WHERE owner = ${user.name} OR name IN (SELECT project_name FROM project_members WHERE employee_name = ${user.name}))) AND (${from ?? null}::date IS NULL OR COALESCE(due_date, start_date) >= ${from ?? null}::date) AND (${to ?? null}::date IS NULL OR COALESCE(start_date, due_date) <= ${to ?? null}::date) ORDER BY COALESCE(start_date, due_date) NULLS LAST, id`);
}

