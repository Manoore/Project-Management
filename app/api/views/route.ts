import { NextResponse } from "next/server";
import { ensureDatabase, sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(request: Request) {
  if (!await ensureDatabase()) return NextResponse.json([]);
  const user = await getCurrentUser(request);
  return NextResponse.json(await sql!`SELECT id, name, view_type AS "viewType", filters FROM saved_views WHERE employee_name = ${user.name} ORDER BY name`);
}

export async function POST(request: Request) {
  const user = await getCurrentUser(request); const body = await request.json();
  if (!body.name || !body.viewType) return NextResponse.json({ error: "View name and type are required" }, { status: 400 });
  if (!await ensureDatabase()) return NextResponse.json({ ...body, persisted: false }, { status: 201 });
  const rows = await sql!`INSERT INTO saved_views (employee_name, name, view_type, filters) VALUES (${user.name}, ${body.name}, ${body.viewType}, ${JSON.stringify(body.filters ?? {})}::jsonb) ON CONFLICT (employee_name, name) DO UPDATE SET filters = EXCLUDED.filters, view_type = EXCLUDED.view_type RETURNING id, name, view_type AS "viewType", filters`;
  return NextResponse.json(rows[0], { status: 201 });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser(request);
  const id = Number(new URL(request.url).searchParams.get("id")); if (!id) return NextResponse.json({ error: "View id is required" }, { status: 400 });
  if (!await ensureDatabase()) return NextResponse.json({ ok: true, persisted: false });
  await sql!`DELETE FROM saved_views WHERE id = ${id} AND employee_name = ${user.name}`;
  return NextResponse.json({ ok: true });
}

