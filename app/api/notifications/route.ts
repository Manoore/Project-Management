import {NextResponse} from 'next/server';
import {ensureDatabase,sql} from '@/lib/db';
import {getCurrentUser} from '@/lib/auth';
import {positiveId} from '@/lib/operations-input';
export async function GET(request:Request){
  try{
    if(!await ensureDatabase())return NextResponse.json({error:'Database unavailable'},{status:503});
    const user=await getCurrentUser(request).catch(()=>null);if(!user)return NextResponse.json({error:'Please sign in'},{status:401});const params=new URL(request.url).searchParams;
    if(params.get('summary')==='true'){const rows=await sql!`SELECT COUNT(*) FILTER(WHERE NOT read)::int AS "unreadCount",COUNT(*)::int AS "totalCount" FROM visible_notifications(${user.name},NOW())`;return NextResponse.json(rows[0],{headers:{'Cache-Control':'no-store'}});}
    const limit=Number(params.get('limit')||50),before=params.has('before')?Number(params.get('before')):null;
    if(!Number.isInteger(limit)||limit<1||limit>100||before!==null&&!positiveId(before))return NextResponse.json({error:'Use a limit of 1–100 and a valid cursor'},{status:400});
    return NextResponse.json(await sql!`SELECT id,type,message,read,created_at AS "createdAt",task_id AS "taskId",project_id AS "projectId" FROM visible_notifications(${user.name},NOW()) WHERE (${before}::integer IS NULL OR id<${before}) AND (${params.get('unread')!=='true'} OR NOT read) ORDER BY id DESC LIMIT ${limit}`,{headers:{'Cache-Control':'no-store'}});
  }catch{return NextResponse.json({error:'Notifications unavailable. Sign in and retry.'},{status:503});}
}
export async function PATCH(request:Request){
  if(request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'Invalid request origin'},{status:403});
  const b=await request.json().catch(()=>null);
  if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!['all','id','read'].includes(k))||'all'in b&&typeof b.all!=='boolean'||'read'in b&&typeof b.read!=='boolean'||b.all===true&&'id'in b||b.all!==true&&!positiveId(b.id))return NextResponse.json({error:'Choose a notification or all notifications and a boolean read state'},{status:400});
  try{if(!await ensureDatabase())return NextResponse.json({error:'Database unavailable'},{status:503});const user=await getCurrentUser(request).catch(()=>null);if(!user)return NextResponse.json({error:'Please sign in'},{status:401});const rows=await sql!`UPDATE notifications n SET read=${b.read??true} WHERE id IN(SELECT id FROM visible_notifications(${user.name},NOW()) WHERE ${b.all===true} OR id=${b.id??null}) RETURNING n.id,n.read`;return b.all===true||rows.length?NextResponse.json({ok:true,updatedCount:rows.length}):NextResponse.json({error:'Notification unavailable'},{status:404});}catch{return NextResponse.json({error:'Notifications could not be updated'},{status:503});}
}

