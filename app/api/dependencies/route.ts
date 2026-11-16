import { NextResponse } from "next/server";
import { ensureDatabase, sql } from "@/lib/db";

export async function GET(request: Request) {
  if (!await ensureDatabase()) return NextResponse.json([]);
  const taskId = new URL(request.url).searchParams.get("taskId");
  return NextResponse.json(await sql!`SELECT id, task_id AS "taskId", depends_on_task_id AS "dependsOnTaskId" FROM task_dependencies WHERE task_id = ${Number(taskId ?? 0)}`);
}

export async function POST(request: Request) {
  const body = await request.json();
  if (!body.taskId || !body.dependsOnTaskId || body.taskId === body.dependsOnTaskId) return NextResponse.json({ error: "Two different task ids are required" }, { status: 400 });
  if (!await ensureDatabase()) return NextResponse.json({ ...body, persisted: false }, { status: 201 });
  const rows = await sql!`INSERT INTO task_dependencies (task_id, depends_on_task_id) VALUES (${Number(body.taskId)}, ${Number(body.dependsOnTaskId)}) ON CONFLICT DO NOTHING RETURNING id, task_id AS "taskId", depends_on_task_id AS "dependsOnTaskId"`;
  return NextResponse.json(rows[0] ?? { ok: true }, { status: 201 });
}

