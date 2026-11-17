import { NextResponse } from "next/server";
import { ensureDatabase, sql } from "@/lib/db";
import { canManageProjects, getCurrentUser } from "@/lib/auth";

export async function GET() {
  if (!await ensureDatabase()) return NextResponse.json([]);
  return NextResponse.json(await sql!`SELECT id, name, description, lead, archived FROM teams WHERE archived = FALSE ORDER BY name`);
}

export async function POST(request: Request) {
  const user = await getCurrentUser(request); if (!canManageProjects(user)) return NextResponse.json({ error: "Only managers can manage teams" }, { status: 403 });
  const body = await request.json(); if (!body.name?.trim()) return NextResponse.json({ error: "Team name is required" }, { status: 400 });
  if (!await ensureDatabase()) return NextResponse.json({ id: 0, name: body.name, description: body.description ?? "", lead: body.lead ?? user.name, persisted: false }, { status: 201 });
  try {
    const rows = await sql!`INSERT INTO teams (name, description, lead) VALUES (${body.name.trim()}, ${body.description ?? null}, ${body.lead ?? user.name}) RETURNING id, name, description, lead, archived`;
    return NextResponse.json(rows[0], { status: 201 });
  } catch { return NextResponse.json({ error: "A team with this name already exists" }, { status: 409 }); }
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser(request); if (!canManageProjects(user)) return NextResponse.json({ error: "Only managers can manage teams" }, { status: 403 });
  const body = await request.json(); if (!body.id) return NextResponse.json({ error: "Team id is required" }, { status: 400 });
  if (!await ensureDatabase()) return NextResponse.json({ ...body, persisted: false });
  const rows = await sql!`UPDATE teams SET name = COALESCE(${body.name ?? null}, name), description = COALESCE(${body.description ?? null}, description), lead = COALESCE(${body.lead ?? null}, lead), archived = COALESCE(${body.archived ?? null}, archived) WHERE id = ${Number(body.id)} RETURNING id, name, description, lead, archived`;
  return NextResponse.json(rows[0] ?? { error: "Team not found" }, { status: rows[0] ? 200 : 404 });
}

