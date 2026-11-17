import { NextResponse } from "next/server";
import { ensureDatabase, sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  if (!await ensureDatabase()) return NextResponse.json([]);
  return NextResponse.json(await sql!`SELECT id, employee_name AS "employeeName", event_type AS "eventType", message, created_at AS "createdAt" FROM activity_events WHERE employee_name = ${user.name} ORDER BY created_at DESC LIMIT 100`);
}

