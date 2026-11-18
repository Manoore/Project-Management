import {NextResponse} from 'next/server';
import {ensureDatabase,sql} from '@/lib/db';
import {getCurrentUser} from '@/lib/auth';
import {validatePreferences} from '@/lib/operations-input';
const capabilities={inApp:true,dueReminders:true,quietHours:true,email:false,dailyDigest:false};
export async function GET(request:Request){try{if(!await ensureDatabase())return NextResponse.json({error:'Database unavailable'},{status:503});const user=await getCurrentUser(request).catch(()=>null);if(!user)return NextResponse.json({error:'Please sign in'},{status:401});const rows=await sql!`SELECT in_app AS "inApp",email,daily_digest AS "dailyDigest",due_reminders AS "dueReminders",quiet_hours AS "quietHours",time_zone AS "timeZone" FROM notification_preferences WHERE employee_name=${user.name}`;return NextResponse.json({...rows[0]||{inApp:true,email:false,dailyDigest:false,dueReminders:true,quietHours:{},timeZone:'UTC'},capabilities},{headers:{'Cache-Control':'no-store'}});}catch{return NextResponse.json({error:'Preferences unavailable'},{status:503});}}
export async function PATCH(request:Request){
  if(request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'Invalid request origin'},{status:403});
  const b=await request.json().catch(()=>null);if(!b||typeof b!=='object'||Array.isArray(b)||!Object.keys(b).length)return NextResponse.json({error:'Provide notification preferences'},{status:400});
  const invalid=validatePreferences(b);if(invalid)return NextResponse.json({error:invalid},{status:400});
  if(b.email===true||b.dailyDigest===true)return NextResponse.json({error:'Email and digest delivery are not configured. In-app notifications and due reminders are available.'},{status:400});
  try{
    if(!await ensureDatabase())return NextResponse.json({error:'Database unavailable'},{status:503});const user=await getCurrentUser(request).catch(()=>null);if(!user)return NextResponse.json({error:'Please sign in'},{status:401});
    const results=await sql!.transaction([
      sql!`INSERT INTO notification_preferences(employee_name,in_app,email,daily_digest,due_reminders,quiet_hours,time_zone) VALUES(${user.name},${b.inApp??true},${b.email??false},${b.dailyDigest??false},${b.dueReminders??true},${JSON.stringify(b.quietHours??{})}::jsonb,${b.timeZone??'UTC'}) ON CONFLICT(employee_name) DO UPDATE SET in_app=COALESCE(${b.inApp??null},notification_preferences.in_app),email=COALESCE(${b.email??null},notification_preferences.email),daily_digest=COALESCE(${b.dailyDigest??null},notification_preferences.daily_digest),due_reminders=COALESCE(${b.dueReminders??null},notification_preferences.due_reminders),quiet_hours=CASE WHEN ${'quietHours'in b} THEN ${JSON.stringify(b.quietHours??{})}::jsonb ELSE notification_preferences.quiet_hours END,time_zone=COALESCE(${b.timeZone??null},notification_preferences.time_zone) RETURNING in_app AS "inApp",email,daily_digest AS "dailyDigest",due_reminders AS "dueReminders",quiet_hours AS "quietHours",time_zone AS "timeZone"`,
      sql!`UPDATE notifications n SET suppressed=TRUE WHERE employee_name=${user.name} AND NOT read AND ((${b.inApp===false} AND available_at>NOW()) OR (${b.dueReminders===false} AND type IN('due_soon','due_today','overdue')))`,
      sql!`UPDATE notifications SET available_at=notification_delivery_at(${user.name},NOW()) WHERE employee_name=${user.name} AND available_at>NOW() AND NOT suppressed`
    ]);
    return NextResponse.json({...results[0][0],capabilities});
  }catch{return NextResponse.json({error:'Preferences were not saved'},{status:503});}
}
