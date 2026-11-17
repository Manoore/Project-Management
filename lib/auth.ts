import { randomUUID } from "node:crypto";
import { ensureDatabase, sql } from "@/lib/db";

export type CurrentUser = { name: string; initials: string; role: string; team: string; accessRole: "admin" | "manager" | "member" | "viewer" };

const SESSION_COOKIE = "peopleflow_session";

export async function getCurrentUser(request: Request): Promise<CurrentUser> {
  if (!sql) throw new Error("Authentication database unavailable");
  const sessionId = request.headers.get("cookie")?.match(/(?:^|;\s*)peopleflow_session=([^;]+)/)?.[1];
  if (sessionId && !/^[0-9a-f-]{36}$/i.test(sessionId)) throw new Error("Unauthenticated");
  if (sessionId) {
    const sessions = await sql!`SELECT employee_name FROM auth_sessions WHERE id = ${sessionId}::uuid AND provider IN ('password', 'microsoft') AND expires_at > NOW() LIMIT 1`;
    if (sessions[0]) {
      const employee = await sql!`SELECT name, initials, role, team, access_role AS "accessRole" FROM employees WHERE name = ${sessions[0].employee_name} LIMIT 1`;
      if (employee[0]) return employee[0] as CurrentUser;
    }
  }
  throw new Error("Unauthenticated");
}

export async function createDevelopmentSession(employeeName: string) {
  if (!await ensureDatabase()) return { sessionId: "development", user: { name: employeeName, initials: employeeName.slice(0, 2).toUpperCase(), role: "Employee", team: "Product", accessRole: "member" as const } };
  const employee = await sql!`SELECT name, initials, role, team, access_role AS "accessRole" FROM employees WHERE name = ${employeeName} LIMIT 1`;
  if (!employee[0]) throw new Error("Employee not found");
  const sessionId = randomUUID();
  await sql!`INSERT INTO auth_sessions (id, employee_name, provider, expires_at) VALUES (${sessionId}::uuid, ${employeeName}, 'development', NOW() + INTERVAL '7 days')`;
  return { sessionId, user: employee[0] as CurrentUser };
}

export function sessionCookie(sessionId: string) {
  return `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function canManageProjects(user: CurrentUser) {
  return user.accessRole === "admin" || user.accessRole === "manager";
}

