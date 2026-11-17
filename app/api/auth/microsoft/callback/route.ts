import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ensureDatabase, sql } from "@/lib/db";
export async function GET(request: NextRequest) {
  const failed = () => { const r = NextResponse.redirect(new URL("/signin?error=authentication", request.url)); r.cookies.set("peopleflow_oauth", "", { maxAge: 0, path: "/api/auth/microsoft" }); return r; };
  try {
    const context = JSON.parse(request.cookies.get("peopleflow_oauth")?.value ?? "{}");
    const code = request.nextUrl.searchParams.get("code"), state = request.nextUrl.searchParams.get("state");
    const tenant = process.env.MICROSOFT_TENANT_ID;
    if (!code || !state || state !== context.state || !context.verifier || !tenant || ["common", "organizations", "consumers"].includes(tenant)) return failed();
    const tokenResponse = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", client_id: process.env.MICROSOFT_CLIENT_ID ?? "", client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? "", code, code_verifier: context.verifier, redirect_uri: process.env.MICROSOFT_REDIRECT_URI || new URL("/api/auth/microsoft/callback", request.url).href }), cache: "no-store" });
    if (!tokenResponse.ok) return failed();
    const token = await tokenResponse.json();
    const profileResponse = await fetch("https://graph.microsoft.com/oidc/userinfo", { headers: { Authorization: `Bearer ${token.access_token}` }, cache: "no-store" });
    if (!profileResponse.ok || !await ensureDatabase()) return failed();
    const profile = await profileResponse.json(); if (!profile.sub) return failed();
    await sql!`ALTER TABLE employees ADD COLUMN IF NOT EXISTS microsoft_subject TEXT`;
    await sql!`CREATE UNIQUE INDEX IF NOT EXISTS employees_microsoft_subject_unique ON employees (microsoft_subject)`;
    let employees = await sql!`SELECT name FROM employees WHERE microsoft_subject = ${profile.sub} LIMIT 1`;
    if (!employees.length) {
      if (!context.signup) return failed();
      // A stable identity key avoids collisions with seeded display names and existing accounts.
      const name = `${profile.name || "Member"} (${randomUUID().slice(0, 8)})`;
      employees = await sql!`INSERT INTO employees (name, initials, email, role, team, access_role, microsoft_subject) VALUES (${name}, ${String(profile.name || "Member").split(" ").map((x: string) => x[0]).join("").slice(0, 2)}, ${profile.email ?? null}, 'Employee', 'Unassigned', 'member', ${profile.sub}) ON CONFLICT (microsoft_subject) DO UPDATE SET microsoft_subject = EXCLUDED.microsoft_subject RETURNING name`;
    }
    const session = randomUUID();
    await sql!`INSERT INTO auth_sessions (id, employee_name, provider, expires_at) VALUES (${session}::uuid, ${employees[0].name}, 'microsoft', NOW() + INTERVAL '7 days')`;
    const response = NextResponse.redirect(new URL("/workspace", request.url));
    response.cookies.set("peopleflow_session", session, { httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax", maxAge: 604800, path: "/" });
    response.cookies.set("peopleflow_oauth", "", { maxAge: 0, path: "/api/auth/microsoft" });
    return response;
  } catch { return failed(); }
}

