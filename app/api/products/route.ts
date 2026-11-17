import { NextResponse } from "next/server";
import { ensureDatabase, sql } from "@/lib/db";
import { canManageProjects, getCurrentUser } from "@/lib/auth";

export async function GET() {
  if (!await ensureDatabase()) return NextResponse.json([]);
  return NextResponse.json(await sql!`SELECT id, name, description, owner, team, archived FROM products WHERE archived = FALSE ORDER BY name`);
}

export async function POST(request: Request) {
  const user = await getCurrentUser(request); if (!canManageProjects(user)) return NextResponse.json({ error: "Only managers can manage products" }, { status: 403 });
  const body = await request.json(); if (!body.name?.trim()) return NextResponse.json({ error: "Product name is required" }, { status: 400 });
  if (!await ensureDatabase()) return NextResponse.json({ id: 0, name: body.name, description: body.description ?? "", owner: body.owner ?? user.name, team: body.team ?? "Product", persisted: false }, { status: 201 });
  try {
    const rows = await sql!`INSERT INTO products (name, description, owner, team) VALUES (${body.name.trim()}, ${body.description ?? null}, ${body.owner ?? user.name}, ${body.team ?? "Product"}) RETURNING id, name, description, owner, team, archived`;
    return NextResponse.json(rows[0], { status: 201 });
  } catch { return NextResponse.json({ error: "A product with this name already exists" }, { status: 409 }); }
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser(request); if (!canManageProjects(user)) return NextResponse.json({ error: "Only managers can manage products" }, { status: 403 });
  const body = await request.json(); if (!body.id) return NextResponse.json({ error: "Product id is required" }, { status: 400 });
  if (!await ensureDatabase()) return NextResponse.json({ ...body, persisted: false });
  const rows = await sql!`UPDATE products SET name = COALESCE(${body.name ?? null}, name), description = COALESCE(${body.description ?? null}, description), owner = COALESCE(${body.owner ?? null}, owner), team = COALESCE(${body.team ?? null}, team), archived = COALESCE(${body.archived ?? null}, archived) WHERE id = ${Number(body.id)} RETURNING id, name, description, owner, team, archived`;
  return NextResponse.json(rows[0] ?? { error: "Product not found" }, { status: rows[0] ? 200 : 404 });
}

