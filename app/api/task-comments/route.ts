import { NextResponse } from "next/server";
import { ensureDatabase, sql } from "@/lib/db";

export async function GET(request: Request) {
  if (!await ensureDatabase()) return NextResponse.json([]);
  const taskId = new URL(request.url).searchParams.get("taskId");
  return NextResponse.json(await sql!`SELECT id, task_id AS "taskId", employee_name AS "employeeName", body, created_at AS "createdAt" FROM task_comments WHERE task_id = ${Number(taskId ?? 0)} ORDER BY created_at DESC`);
}

export async function POST(request: Request) {
  const body = await request.json();
  if (!body.taskId || !body.body) return NextResponse.json({ error: "Task and comment are required" }, { status: 400 });
  if (!await ensureDatabase()) return NextResponse.json({ ...body, persisted: false }, { status: 201 });
  const rows = await sql!`INSERT INTO task_comments (task_id, employee_name, body) VALUES (${Number(body.taskId)}, ${body.employeeName ?? "Maya"}, ${body.body}) RETURNING id, task_id AS "taskId", employee_name AS "employeeName", body, created_at AS "createdAt"`;
  await sql!`INSERT INTO activity_events (employee_name, event_type, message) VALUES (${body.employeeName ?? "Maya"}, 'comment_added', ${`Comment added to task ${body.taskId}`})`;
  return NextResponse.json(rows[0], { status: 201 });
}

