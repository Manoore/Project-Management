import { NextResponse } from "next/server";
import { ensureDatabase, sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(request: Request) {
  if (!await ensureDatabase()) return NextResponse.json([]);
  const user = await getCurrentUser(request);
  return NextResponse.json(await sql!`SELECT id, title, description, owner, status, progress, target_date AS "targetDate" FROM goals WHERE owner = ${user.name} OR status = 'Active' ORDER BY target_date NULLS LAST, id`);
}

export async function POST(request: Request) {
  const user = await getCurrentUser(request); const body = await request.json();
  if (!body.title) return NextResponse.json({ error: "Goal title is required" }, { status: 400 });
  if (!await ensureDatabase()) return NextResponse.json({ ...body, persisted: false }, { status: 201 });
  const rows = await sql!`INSERT INTO goals (title, description, owner, target_date) VALUES (${body.title}, ${body.description ?? null}, ${body.owner ?? user.name}, ${body.targetDate || null}) RETURNING id, title, description, owner, status, progress, target_date AS "targetDate"`;
  await sql!`INSERT INTO audit_logs (employee_name, action, entity_type, entity_id, details) VALUES (${user.name}, 'created', 'goal', ${String(rows[0].id)}, ${JSON.stringify({ title: body.title })}::jsonb)`;
  return NextResponse.json(rows[0], { status: 201 });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser(request); const body = await request.json();
  if (!body.id) return NextResponse.json({ error: "Goal id is required" }, { status: 400 });
  if (!await ensureDatabase()) return NextResponse.json({ ok: true, persisted: false });
  const rows = await sql!`UPDATE goals SET title = COALESCE(${body.title ?? null}, title), description = COALESCE(${body.description ?? null}, description), status = COALESCE(${body.status ?? null}, status), progress = COALESCE(${body.progress ?? null}, progress), target_date = COALESCE(${body.targetDate ?? null}, target_date) WHERE id = ${Number(body.id)} RETURNING id, title, description, owner, status, progress, target_date AS "targetDate"`;
  if (rows[0]) await sql!`INSERT INTO audit_logs (employee_name, action, entity_type, entity_id, details) VALUES (${user.name}, 'updated', 'goal', ${String(body.id)}, ${JSON.stringify(body)}::jsonb)`;
  return NextResponse.json(rows[0] ?? { error: "Goal not found" }, { status: rows[0] ? 200 : 404 });
}

