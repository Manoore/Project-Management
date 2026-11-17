import { NextResponse } from "next/server";
import { ensureDatabase, sql } from "@/lib/db";

export async function GET(request: Request) {
  if (!await ensureDatabase()) return NextResponse.json([]);
  const taskId = new URL(request.url).searchParams.get("taskId");
  return NextResponse.json(await sql!`SELECT id, task_id AS "taskId", field_key AS "fieldKey", field_value AS "fieldValue" FROM task_custom_fields WHERE task_id = ${Number(taskId ?? 0)} ORDER BY field_key`);
}

export async function POST(request: Request) {
  const body = await request.json();
  if (!body.taskId || !body.fieldKey) return NextResponse.json({ error: "Task and field key are required" }, { status: 400 });
  if (!await ensureDatabase()) return NextResponse.json({ ...body, persisted: false }, { status: 201 });
  const rows = await sql!`INSERT INTO task_custom_fields (task_id, field_key, field_value) VALUES (${Number(body.taskId)}, ${body.fieldKey}, ${String(body.fieldValue ?? "")}) ON CONFLICT (task_id, field_key) DO UPDATE SET field_value = EXCLUDED.field_value RETURNING id, task_id AS "taskId", field_key AS "fieldKey", field_value AS "fieldValue"`;
  return NextResponse.json(rows[0], { status: 201 });
}

