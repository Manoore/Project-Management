import { NextResponse } from "next/server";
import { ensureDatabase, sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  if (!await ensureDatabase()) return NextResponse.json([]);
  return NextResponse.json(await sql!`SELECT id, name, description, definition, created_by AS "createdBy" FROM project_templates ORDER BY name`);
}

export async function POST(request: Request) {
  const user = await getCurrentUser(request); const body = await request.json();
  if (!body.name) return NextResponse.json({ error: "Template name is required" }, { status: 400 });
  if (!await ensureDatabase()) return NextResponse.json({ ...body, persisted: false }, { status: 201 });
  const rows = await sql!`INSERT INTO project_templates (name, description, definition, created_by) VALUES (${body.name}, ${body.description ?? null}, ${JSON.stringify(body.definition ?? {})}::jsonb, ${user.name}) RETURNING id, name, description, definition, created_by AS "createdBy"`;
  return NextResponse.json(rows[0], { status: 201 });
}

