import { NextResponse } from 'next/server';
import { getCurrentUser, type CurrentUser } from './auth';
import { ensureDatabase } from './db';
import { getVisibleProject, type VisibleProject } from './project-access';
export const validId = (id: unknown): id is number => typeof id === 'number' && Number.isInteger(id) && id > 0 && id <= 2147483647;
export async function deliveryAccess(request: Request, projectId: unknown, write = false, manage = false): Promise<{ user: CurrentUser; project: VisibleProject } | NextResponse> {
  if (!validId(projectId)) return NextResponse.json({error:'Choose a valid project'}, {status:400});
  if (write && request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({error:'Invalid request origin'}, {status:403});
  if (!await ensureDatabase()) return NextResponse.json({error:'Database unavailable'}, {status:503});
  let user: CurrentUser;
  try { user = await getCurrentUser(request); } catch { return NextResponse.json({error:'Sign in to continue'}, {status:401}); }
  if (write && (user.accessRole==='viewer' || manage && !['admin','manager'].includes(user.accessRole))) return NextResponse.json({error:manage?'Managers and administrators can configure delivery':'Viewers have read-only access'}, {status:403});
  const project=await getVisibleProject(user, projectId);
  return project ? {user,project} : NextResponse.json({error:'Project unavailable'}, {status:404});
}
export function deliveryFailure(error: unknown) {
  const code=(error as {code?:string}).code;
  return NextResponse.json({error: code==='23505'?'That name is already used in this project':'Changes could not be saved. Refresh and retry.'}, {status:code==='23505'?409:503});
}
