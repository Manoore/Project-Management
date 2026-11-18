import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { deliveryAccess, deliveryFailure, validId } from '@/lib/delivery-access';
import { taskStatuses } from '@/lib/work-items';
export async function GET(request: Request) {
  try {
    const projectId=Number(new URL(request.url).searchParams.get('projectId'));
    const access=await deliveryAccess(request,projectId); if(access instanceof NextResponse) return access;
    return NextResponse.json(await sql!`SELECT id,name,category,position,is_default AS "isDefault" FROM project_workflow_states WHERE project_id=${projectId} ORDER BY position,id`,{headers:{'Cache-Control':'no-store'}});
  } catch(e){return deliveryFailure(e);}
}
export async function POST(request: Request){return save(request,false);}
export async function PATCH(request: Request){return save(request,true);}
async function save(request:Request,editing:boolean){
  try{
    const body=await request.json().catch(()=>null);
    if(!body || typeof body.name!=='string' || !body.name.trim() || body.name.trim().length>50 || !taskStatuses.includes(body.category) || !Number.isInteger(body.position) || body.position<0 || body.position>100 || editing&&!validId(body.id)) return NextResponse.json({error:'Use a stage name, category, and order from 0–100'},{status:400});
    const access=await deliveryAccess(request,body.projectId,true,true);if(access instanceof NextResponse)return access;
    const result=await sql!.transaction([
      sql!`SELECT pg_advisory_xact_lock(hashtext('planning:' || ${String(body.projectId)}))`,
      editing?sql!`WITH changed AS (UPDATE project_workflow_states SET name=${body.name.trim()},category=${body.category},position=${body.position} WHERE id=${body.id} AND project_id=${body.projectId} AND (NOT is_default OR category=${body.category}) RETURNING *), work AS (UPDATE tasks t SET status=c.category,completed=(c.category='Done'),updated_at=NOW() FROM changed c WHERE t.workflow_state_id=c.id), audit AS(INSERT INTO activity_events(employee_name,event_type,message) SELECT ${access.user.name},'workflow_updated','Updated workflow stage '||name FROM changed) SELECT id,name,category,position,is_default AS "isDefault" FROM changed`
      :sql!`WITH changed AS (INSERT INTO project_workflow_states(project_id,name,category,position) SELECT ${body.projectId},${body.name.trim()},${body.category},${body.position} WHERE (SELECT COUNT(*) FROM project_workflow_states WHERE project_id=${body.projectId})<30 RETURNING *), audit AS(INSERT INTO activity_events(employee_name,event_type,message) SELECT ${access.user.name},'workflow_created','Added workflow stage '||name FROM changed) SELECT id,name,category,position,is_default AS "isDefault" FROM changed`
    ],{isolationLevel:'ReadCommitted'});
    return result[1][0]?NextResponse.json(result[1][0],{status:editing?200:201}):NextResponse.json({error:'Stage unavailable, default category cannot change, or stage limit reached'},{status:409});
  }catch(e){return deliveryFailure(e);}
}
export async function DELETE(request: Request){
  try{
    const body=await request.json().catch(()=>null);if(!body||!validId(body.id))return NextResponse.json({error:'Choose a stage'},{status:400});
    const access=await deliveryAccess(request,body.projectId,true,true);if(access instanceof NextResponse)return access;
    const result=await sql!.transaction([sql!`SELECT pg_advisory_xact_lock(hashtext('planning:' || ${String(body.projectId)}))`,sql!`WITH removed AS(DELETE FROM project_workflow_states WHERE id=${body.id} AND project_id=${body.projectId} AND NOT is_default RETURNING id,name), audit AS(INSERT INTO activity_events(employee_name,event_type,message) SELECT ${access.user.name},'workflow_removed','Removed workflow stage '||name FROM removed) SELECT id FROM removed`],{isolationLevel:'ReadCommitted'});
    return result[1][0]?NextResponse.json({ok:true}):NextResponse.json({error:'Default stages cannot be removed'},{status:409});
  }catch(e){return deliveryFailure(e);}
}
