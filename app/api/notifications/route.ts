import { NextResponse } from "next/server";
import { ensureDatabase, sql } from "@/lib/db";

export async function GET() {
  if (!await ensureDatabase()) return NextResponse.json([]);
  return NextResponse.json(await sql!`SELECT id, type, message, read, created_at AS "createdAt" FROM notifications WHERE employee_name = 'Maya' ORDER BY created_at DESC LIMIT 50`);
}

export async function PATCH(request: Request) {
  const body = await request.json();
  if (!await ensureDatabase()) return NextResponse.json({ ok: true, persisted: false });
  if (body.all) await sql!`UPDATE notifications SET read = TRUE WHERE employee_name = 'Maya'`;
  else if (body.id) await sql!`UPDATE notifications SET read = TRUE WHERE id = ${Number(body.id)} AND employee_name = 'Maya'`;
  return NextResponse.json({ ok: true });
}


