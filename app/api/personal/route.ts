import { NextResponse } from "next/server";
import { ensureDatabase, sql } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  try {
    if (!await ensureDatabase()) throw new Error('Database unavailable');
    const [time, checkins] = await Promise.all([
      sql!`SELECT id, clocked_in_at AS "startedAt", clocked_out_at AS "endedAt", EXTRACT(EPOCH FROM (COALESCE(clocked_out_at, NOW()) - clocked_in_at))::int AS seconds FROM time_entries WHERE employee_name = ${user.name} ORDER BY clocked_in_at DESC LIMIT 50`,
      sql!`SELECT id, mood, created_at AS "createdAt" FROM checkins WHERE employee_name = ${user.name} ORDER BY created_at DESC LIMIT 30`
    ]);
    return NextResponse.json({ time, checkins }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'Could not load your history' }, { status: 503 }); }
}

