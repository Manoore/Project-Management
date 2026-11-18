import {NextResponse} from 'next/server';
import {cronConfigured,validCronRequest} from '@/lib/cron-auth';
import {runScheduledWork} from '@/lib/scheduled-work';
export const maxDuration=60;
export async function GET(request:Request){
  if(!cronConfigured())return NextResponse.json({error:'Scheduled work is not configured'},{status:503});
  if(!validCronRequest(request))return NextResponse.json({error:'Unauthorized'},{status:401});
  try{return NextResponse.json(await runScheduledWork(),{headers:{'Cache-Control':'no-store'}});}catch{return NextResponse.json({error:'Scheduled work failed. Retry from the administrator endpoint.'},{status:503});}
}
