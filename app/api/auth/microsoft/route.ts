import { randomBytes, createHash } from "node:crypto";
import { NextResponse } from "next/server";
export async function GET(request: Request) {
  const tenant = process.env.MICROSOFT_TENANT_ID;
  if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET || !tenant || ["common", "organizations", "consumers"].includes(tenant)) return NextResponse.redirect(new URL("/signin?error=configuration", request.url));
  const state = randomBytes(32).toString("hex"), verifier = randomBytes(32).toString("base64url");
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI || new URL("/api/auth/microsoft/callback", request.url).href;
  const url = new URL(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize`);
  url.search = new URLSearchParams({ client_id: process.env.MICROSOFT_CLIENT_ID, redirect_uri: redirectUri, response_type: "code", response_mode: "query", scope: "openid profile email", state, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" }).toString();
  const response = NextResponse.redirect(url);
  response.cookies.set("peopleflow_oauth", JSON.stringify({ state, verifier, signup: new URL(request.url).searchParams.get("mode") === "signup" }), { httpOnly: true, secure: new URL(request.url).protocol === "https:", sameSite: "lax", maxAge: 600, path: "/api/auth/microsoft" });
  return response;
}

