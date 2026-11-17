import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  let authenticated = false;
  try { await getCurrentUser(new Request("https://peopleflow.local/workspace", { headers: await headers() })); authenticated = true; } catch {}
  if (!authenticated) redirect("/signin");
  return children;
}

