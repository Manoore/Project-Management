import { NextResponse } from "next/server";
import { ensureDatabase, sql } from "@/lib/db";
import { getCurrentUser } from '@/lib/auth';

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!await ensureDatabase()) return NextResponse.json([]);
  return NextResponse.json(await sql!`SELECT owner, COUNT(*)::int AS "openTasks", COUNT(*) FILTER (WHERE priority IN ('High', 'Urgent'))::int AS "highPriority", COUNT(*) FILTER (WHERE due_date < CURRENT_DATE)::int AS overdue FROM tasks WHERE completed = FALSE AND ((project_name = 'General' AND owner = ${user.name}) OR project_name IN (SELECT name FROM projects WHERE NOT archived AND (owner = ${user.name} OR name IN (SELECT project_name FROM project_members WHERE employee_name = ${user.name})))) GROUP BY owner ORDER BY "openTasks" DESC`);
}

