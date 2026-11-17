import { NextResponse } from "next/server";
import { ensureDatabase, sql } from "@/lib/db";
import { canManageProjects, getCurrentUser } from "@/lib/auth";

export async function GET() {
  if (!await ensureDatabase()) return NextResponse.json([]);
  return NextResponse.json(await sql!`SELECT id, name, trigger_type AS "triggerType", conditions, actions, enabled, created_by AS "createdBy" FROM automation_rules ORDER BY id DESC`);
}

export async function POST(request: Request) {
  const user = await getCurrentUser(request); if (!canManageProjects(user)) return NextResponse.json({ error: "Only managers can manage automations" }, { status: 403 });
  const body = await request.json(); if (!body.name || !body.triggerType) return NextResponse.json({ error: "Name and trigger are required" }, { status: 400 });
  if (!await ensureDatabase()) return NextResponse.json({ ...body, persisted: false }, { status: 201 });
  const rows = await sql!`INSERT INTO automation_rules (name, trigger_type, conditions, actions, created_by) VALUES (${body.name}, ${body.triggerType}, ${JSON.stringify(body.conditions ?? {})}::jsonb, ${JSON.stringify(body.actions ?? {})}::jsonb, ${user.name}) RETURNING id, name, trigger_type AS "triggerType", conditions, actions, enabled, created_by AS "createdBy"`;
  return NextResponse.json(rows[0], { status: 201 });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser(request); if (!canManageProjects(user)) return NextResponse.json({ error: "Only managers can manage automations" }, { status: 403 });
  const body = await request.json(); if (!body.id) return NextResponse.json({ error: "Automation id is required" }, { status: 400 });
  if (!await ensureDatabase()) return NextResponse.json({ ok: true, persisted: false });
  const rows = await sql!`UPDATE automation_rules SET enabled = COALESCE(${body.enabled ?? null}, enabled), name = COALESCE(${body.name ?? null}, name), conditions = COALESCE(${body.conditions ? JSON.stringify(body.conditions) : null}::jsonb, conditions), actions = COALESCE(${body.actions ? JSON.stringify(body.actions) : null}::jsonb, actions) WHERE id = ${Number(body.id)} RETURNING id, name, trigger_type AS "triggerType", conditions, actions, enabled, created_by AS "createdBy"`;
  return NextResponse.json(rows[0] ?? { error: "Automation not found" }, { status: rows[0] ? 200 : 404 });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser(request); if (!canManageProjects(user)) return NextResponse.json({ error: "Only managers can manage automations" }, { status: 403 });
  const id = Number(new URL(request.url).searchParams.get("id")); if (!id) return NextResponse.json({ error: "Automation id is required" }, { status: 400 });
  if (!await ensureDatabase()) return NextResponse.json({ ok: true, persisted: false });
  await sql!`DELETE FROM automation_rules WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}

