import { NextResponse } from "next/server";
import { ensureDatabase, sql } from "@/lib/db";
import { getCurrentUser } from '@/lib/auth';
import { canAccessTask } from '@/lib/task-access';

export async function GET(request: Request) {
  if (!await ensureDatabase()) return NextResponse.json([]);
  const taskId = new URL(request.url).searchParams.get("taskId");
  if (!await canAccessTask(await getCurrentUser(request), Number(taskId))) return NextResponse.json({ error: 'Task unavailable' }, { status: 404 });
  return NextResponse.json(await sql!`SELECT id, task_id AS "taskId", employee_name AS "employeeName", body, created_at AS "createdAt" FROM task_comments WHERE task_id = ${Number(taskId ?? 0)} ORDER BY created_at DESC`);
}

export async function POST(request: Request) {
  const body = await request.json();
  if (!body.taskId || !body.body) return NextResponse.json({ error: "Task and comment are required" }, { status: 400 });
  const user = await getCurrentUser(request);
  if (!await canAccessTask(user, Number(body.taskId), true)) return NextResponse.json({ error: 'Task unavailable or read-only' }, { status: 403 });
  if (typeof body.body !== 'string' || !body.body.trim() || body.body.length > 5000) return NextResponse.json({ error: 'Enter a comment up to 5,000 characters' }, { status: 400 });
  body.employeeName = user.name;
  if (!await ensureDatabase()) return NextResponse.json({ ...body, persisted: false }, { status: 201 });
  const rows = await sql!`INSERT INTO task_comments (task_id, employee_name, body) VALUES (${Number(body.taskId)}, ${body.employeeName ?? "Maya"}, ${body.body}) RETURNING id, task_id AS "taskId", employee_name AS "employeeName", body, created_at AS "createdAt"`;
  await sql!`INSERT INTO activity_events (employee_name, event_type, message) VALUES (${body.employeeName ?? "Maya"}, 'comment_added', ${`Comment added to task ${body.taskId}`})`;
  return NextResponse.json(rows[0], { status: 201 });
}

