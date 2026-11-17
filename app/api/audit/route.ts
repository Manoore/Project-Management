import { NextResponse } from "next/server";
import { ensureDatabase, sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(request: Request) {
  if (!await ensureDatabase()) return NextResponse.json([]);
  const user = await getCurrentUser(request);
  const limit = Math.min(Number(new URL(request.url).searchParams.get("limit") ?? 100), 500);
  return NextResponse.json(await sql!`SELECT id, employee_name AS "employeeName", action, entity_type AS "entityType", entity_id AS "entityId", details, created_at AS "createdAt" FROM audit_logs WHERE ${user.accessRole === "admin"} OR employee_name = ${user.name} ORDER BY created_at DESC LIMIT ${limit}`);
}

