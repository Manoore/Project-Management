import {NextResponse} from 'next/server';
import {getCurrentUser} from '@/lib/auth';
import {ensureDatabase,sql} from '@/lib/db';
import {cronConfigured} from '@/lib/cron-auth';
import {runScheduledWork} from '@/lib/scheduled-work';
export const maxDuration=60;
async function access(request:Request){if(!await ensureDatabase())return NextResponse.json({error:'Database unavailable'},{status:503});try{const user=await getCurrentUser(request);if(user.accessRole!=='admin')return NextResponse.json({error:'Administrator access required'},{status:403});return null;}catch{return NextResponse.json({error:'Sign in to continue'},{status:401});}}
export async function GET(request:Request){try{const denied=await access(request);if(denied)return denied;return NextResponse.json({configured:cronConfigured(),schedule:'0 8 * * *',timeZone:'UTC',runs:await sql!`SELECT id,started_at AS "startedAt",finished_at AS "finishedAt",status,generated_tasks AS "generatedTasks",reminders,schedules_examined AS "schedulesExamined",has_more AS "hasMore",error_code AS "errorCode" FROM scheduler_runs ORDER BY id DESC LIMIT 20`},{headers:{'Cache-Control':'no-store'}});}catch{return NextResponse.json({error:'Scheduler status unavailable'},{status:503});}}
export async function POST(request:Request){if(request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'Invalid request origin'},{status:403});try{const denied=await access(request);if(denied)return denied;return NextResponse.json(await runScheduledWork(),{headers:{'Cache-Control':'no-store'}});}catch{return NextResponse.json({error:'Scheduled work failed. No partial job changes committed.'},{status:503});}}
