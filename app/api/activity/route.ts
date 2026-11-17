import { NextResponse } from "next/server";
import { ensureDatabase, sql } from "@/lib/db";

export async function GET() {
  if (!await ensureDatabase()) return NextResponse.json([]);
  return NextResponse.json(await sql!`SELECT id, employee_name AS "employeeName", event_type AS "eventType", message, created_at AS "createdAt" FROM activity_events ORDER BY created_at DESC LIMIT 100`);
}

