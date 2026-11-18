import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { deliveryAccess, deliveryFailure } from '@/lib/delivery-access';
export async function GET(request:Request){
  try{
    const projectId=Number(new URL(request.url).searchParams.get('projectId'));
    const access=await deliveryAccess(request,projectId);if(access instanceof NextResponse)return access;
    const name=access.project.name;
    const results=await sql!.transaction([
      sql!`SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE completed)::int AS completed,COUNT(*) FILTER(WHERE NOT completed AND due_date<CURRENT_DATE)::int AS overdue,COUNT(*) FILTER(WHERE NOT completed AND due_date IS NULL)::int AS undated,COUNT(*) FILTER(WHERE NOT completed AND cycle_id IS NULL)::int AS backlog FROM tasks WHERE project_name=${name}`,
      sql!`SELECT COALESCE(w.name,t.status) AS name,COUNT(*)::int AS count FROM tasks t LEFT JOIN project_workflow_states w ON w.id=t.workflow_state_id OR (t.workflow_state_id IS NULL AND w.project_id=${projectId} AND w.is_default AND w.category=t.status) WHERE t.project_name=${name} GROUP BY COALESCE(w.name,t.status) ORDER BY name`,
      sql!`SELECT owner AS name,COUNT(*) FILTER(WHERE NOT completed)::int AS open,COUNT(*) FILTER(WHERE completed)::int AS completed,COUNT(*) FILTER(WHERE NOT completed AND due_date<CURRENT_DATE)::int AS overdue FROM tasks WHERE project_name=${name} GROUP BY owner ORDER BY open DESC,name`,
      sql!`SELECT priority AS name,COUNT(*)::int AS count FROM tasks WHERE project_name=${name} AND NOT completed GROUP BY priority ORDER BY priority`,
      sql!`SELECT d.day::date::text AS date,COUNT(e.id) FILTER(WHERE event_type='completed')::int AS completed,COUNT(e.id) FILTER(WHERE event_type='reopened')::int AS reopened,COUNT(e.id) FILTER(WHERE event_type='created')::int AS created FROM generate_series(CURRENT_DATE-29,CURRENT_DATE,'1 day'::interval) d(day) LEFT JOIN task_delivery_events e ON e.project_name=${name} AND e.recorded_at>=d.day AND e.recorded_at<d.day+INTERVAL '1 day' GROUP BY d.day ORDER BY d.day`,
      sql!`SELECT c.id,c.name,c.start_date::text AS "startDate",c.end_date::text AS "endDate",COUNT(t.id)::int AS total,COUNT(t.id) FILTER(WHERE t.completed)::int AS completed,COUNT(t.id) FILTER(WHERE NOT t.completed AND t.due_date<CURRENT_DATE)::int AS overdue,GREATEST(0,c.end_date-CURRENT_DATE)::int AS "daysRemaining" FROM project_cycles c LEFT JOIN tasks t ON t.cycle_id=c.id WHERE c.project_id=${projectId} AND NOT c.archived GROUP BY c.id ORDER BY c.start_date,c.id`,
      sql!`SELECT CASE WHEN CURRENT_DATE-created_at::date<=7 THEN '0–7 days' WHEN CURRENT_DATE-created_at::date<=14 THEN '8–14 days' WHEN CURRENT_DATE-created_at::date<=30 THEN '15–30 days' ELSE '31+ days' END AS name,COUNT(*)::int AS count FROM tasks WHERE project_name=${name} AND NOT completed GROUP BY 1`,
      sql!`SELECT started_at AS "trackingSince",CURRENT_DATE::text AS "asOfDate" FROM delivery_tracking LIMIT 1`
    ],{isolationLevel:'RepeatableRead',readOnly:true});
    return NextResponse.json({summary:results[0][0],statuses:results[1],owners:results[2],priorities:results[3],trend:results[4],cycles:results[5],aging:results[6],...results[7][0]},{headers:{'Cache-Control':'no-store'}});
  }catch(e){return deliveryFailure(e);}
}
