import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { deliveryAccess, deliveryFailure, validId } from '@/lib/delivery-access';
import { validCalendarDate } from '@/lib/work-items';
export async function GET(request:Request){
  try{
    const projectId=Number(new URL(request.url).searchParams.get('projectId'));
    const access=await deliveryAccess(request,projectId);if(access instanceof NextResponse)return access;
    return NextResponse.json(await sql!`SELECT m.id,m.name,m.description,m.owner,m.target_date AS "targetDate",m.version,COUNT(t.id)::int AS "taskCount",COUNT(t.id) FILTER(WHERE t.completed)::int AS "completedCount" FROM project_modules m LEFT JOIN tasks t ON t.module_id=m.id WHERE m.project_id=${projectId} AND NOT m.archived GROUP BY m.id ORDER BY m.id`,{headers:{'Cache-Control':'no-store'}});
  }catch(e){return deliveryFailure(e);}
}
export async function POST(request:Request){return save(request,false);}
export async function PATCH(request:Request){return save(request,true);}
async function save(request:Request,editing:boolean){
  try{
    const b=await request.json().catch(()=>null);if(!b)return NextResponse.json({error:'Provide module details'},{status:400});
    const access=await deliveryAccess(request,b.projectId,true, b.action!=='assign');if(access instanceof NextResponse)return access;
    if(b.action==='assign'){
      if(!validId(b.taskId)||b.moduleId!==null&&!validId(b.moduleId))return NextResponse.json({error:'Choose a task and module'},{status:400});
      const result=await sql!.transaction([sql!`SELECT pg_advisory_xact_lock(hashtext('planning:' || ${String(b.projectId)}))`,sql!`UPDATE tasks SET module_id=${b.moduleId}::integer,updated_at=NOW() WHERE id=${b.taskId} AND project_name=${access.project.name} AND (${b.moduleId}::integer IS NULL OR EXISTS(SELECT 1 FROM project_modules WHERE id=${b.moduleId} AND project_id=${b.projectId} AND NOT archived)) RETURNING id,module_id AS "moduleId"`],{isolationLevel:'ReadCommitted'});
      return result[1][0]?NextResponse.json(result[1][0]):NextResponse.json({error:'Task or module unavailable in this project'},{status:409});
    }
    if(typeof b.name!=='string'||!b.name.trim()||b.name.trim().length>100||typeof b.description!=='string'||b.description.length>5000||typeof b.owner!=='string'||!b.owner.trim()||b.targetDate!==null&&!validCalendarDate(b.targetDate)||editing&&(!validId(b.id)||!validId(b.version)))return NextResponse.json({error:'Provide a name, description, project owner, and valid target date'},{status:400});
    const members=await sql!`SELECT id FROM projects WHERE id=${b.projectId} AND (owner=${b.owner} OR EXISTS(SELECT 1 FROM project_members WHERE project_name=${access.project.name} AND employee_name=${b.owner}))`;
    if(!members.length)return NextResponse.json({error:'Module owner must be a project member'},{status:400});
    const rows=editing?await sql!`UPDATE project_modules SET name=${b.name.trim()},description=${b.description},owner=${b.owner},target_date=${b.targetDate}::date,version=version+1 WHERE id=${b.id} AND project_id=${b.projectId} AND version=${b.version} AND NOT archived RETURNING id,name,description,owner,target_date AS "targetDate",version`
    :await sql!`INSERT INTO project_modules(project_id,name,description,owner,target_date) VALUES(${b.projectId},${b.name.trim()},${b.description},${b.owner},${b.targetDate}::date) RETURNING id,name,description,owner,target_date AS "targetDate",version`;
    return rows[0]?NextResponse.json(rows[0],{status:editing?200:201}):NextResponse.json({error:'Module changed. Reload before saving.'},{status:409});
  }catch(e){return deliveryFailure(e);}
}
export async function DELETE(request:Request){
  try{
    const b=await request.json().catch(()=>null);if(!b||!validId(b.id)||!validId(b.version))return NextResponse.json({error:'Choose a module revision'},{status:400});
    const access=await deliveryAccess(request,b.projectId,true,true);if(access instanceof NextResponse)return access;
    const result=await sql!.transaction([sql!`SELECT pg_advisory_xact_lock(hashtext('planning:' || ${String(b.projectId)}))`,sql!`WITH archived AS(UPDATE project_modules SET archived=TRUE,version=version+1 WHERE id=${b.id} AND project_id=${b.projectId} AND version=${b.version} AND NOT archived RETURNING id), cleared AS(UPDATE tasks SET module_id=NULL,updated_at=NOW() WHERE module_id IN(SELECT id FROM archived)) SELECT id FROM archived`],{isolationLevel:'ReadCommitted'});
    return result[1][0]?NextResponse.json({ok:true}):NextResponse.json({error:'Module changed or unavailable. Reload before archiving.'},{status:409});
  }catch(e){return deliveryFailure(e);}
}
