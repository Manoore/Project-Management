import { NextResponse } from "next/server";
import { ensureDatabase, sql } from "@/lib/db";

export async function GET() {
  if (!await ensureDatabase()) return NextResponse.json({ projects: [], tasks: [], workload: [] });
  const [projects, tasks, workload] = await Promise.all([
    sql!`SELECT status, COUNT(*)::int AS count FROM projects GROUP BY status ORDER BY status`,
    sql!`SELECT status, COUNT(*)::int AS count, COUNT(*) FILTER (WHERE completed)::int AS completed FROM tasks GROUP BY status ORDER BY status`,
    sql!`SELECT owner, COUNT(*)::int AS open_tasks FROM tasks WHERE completed = FALSE GROUP BY owner ORDER BY open_tasks DESC`,
  ]);
  return NextResponse.json({ projects, tasks, workload, generatedAt: new Date().toISOString() });
}

