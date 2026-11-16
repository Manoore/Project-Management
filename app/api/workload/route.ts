import { NextResponse } from "next/server";
import { ensureDatabase, sql } from "@/lib/db";

export async function GET() {
  if (!await ensureDatabase()) return NextResponse.json([]);
  return NextResponse.json(await sql!`SELECT owner, COUNT(*)::int AS "openTasks", COUNT(*) FILTER (WHERE priority = 'High')::int AS "highPriority", COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND completed = FALSE)::int AS overdue FROM tasks WHERE completed = FALSE GROUP BY owner ORDER BY "openTasks" DESC`);
}

