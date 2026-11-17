import { NextResponse } from "next/server";
import { ensureDatabase, sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(request: Request) {
  if (!await ensureDatabase()) return NextResponse.json({ error: "Database is not configured" }, { status: 503 });
  const user = await getCurrentUser(request);
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (id) return NextResponse.json(await sql!`SELECT id, body, CASE WHEN anonymous THEN 'Anonymous' ELSE author END AS author, created_at AS "createdAt" FROM idea_comments WHERE idea_id = ${id} ORDER BY created_at`);
  return NextResponse.json(await sql!`SELECT i.id, i.title, i.body, i.category, i.status, i.anonymous, CASE WHEN i.anonymous THEN 'Anonymous' ELSE i.author END AS author, i.created_at AS "createdAt", (SELECT COUNT(*)::int FROM idea_votes WHERE idea_id = i.id) AS votes, EXISTS(SELECT 1 FROM idea_votes WHERE idea_id = i.id AND employee_name = ${user.name}) AS voted FROM ideas i ORDER BY i.created_at DESC`);
}

export async function POST(request: Request) {
  if (!await ensureDatabase()) return NextResponse.json({ error: "Database is not configured" }, { status: 503 });
  const user = await getCurrentUser(request); const body = await request.json();
  if (body.action === "vote") {
    const idea = await sql!`SELECT id FROM ideas WHERE id = ${Number(body.id)}`;
    if (!idea.length) return NextResponse.json({ error: "Idea not found" }, { status: 404 });
    if (body.voted) await sql!`INSERT INTO idea_votes (idea_id, employee_name) VALUES (${Number(body.id)}, ${user.name}) ON CONFLICT DO NOTHING`;
    else await sql!`DELETE FROM idea_votes WHERE idea_id = ${Number(body.id)} AND employee_name = ${user.name}`;
    return NextResponse.json({ ok: true });
  }
  if (body.action === "comment") {
    if (!body.body?.trim() || body.body.length > 5000) return NextResponse.json({ error: "Enter a comment up to 5,000 characters" }, { status: 400 });
    await sql!`INSERT INTO idea_comments (idea_id, author, anonymous, body) VALUES (${Number(body.id)}, ${user.name}, ${body.anonymous === true}, ${body.body.trim()})`;
    return NextResponse.json({ ok: true }, { status: 201 });
  }
  if (!body.title?.trim() || !body.body?.trim() || body.title.length > 200 || body.body.length > 5000) return NextResponse.json({ error: "Title and description are required (200 / 5,000 characters maximum)" }, { status: 400 });
  await sql!`INSERT INTO ideas (title, body, category, author, anonymous) VALUES (${body.title.trim()}, ${body.body.trim()}, ${["Improvement", "Culture", "Product", "Process"].includes(body.category) ? body.category : "Improvement"}, ${user.name}, ${body.anonymous === true})`;
  return NextResponse.json({ ok: true }, { status: 201 });
}

