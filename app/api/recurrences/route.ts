import {NextResponse} from 'next/server';
import {sql} from '@/lib/db';
import {deliveryAccess,deliveryFailure} from '@/lib/delivery-access';
import {positiveId,validateRecurrence} from '@/lib/operations-input';
import {normalizeTaskLabels} from '@/lib/work-items';
const canEdit=(user:{name:string;accessRole:string},project:{owner:string},schedule:{createdBy:string})=>user.name===schedule.createdBy||user.name===project.owner||['admin','manager'].includes(user.accessRole);
export async function GET(request:Request){
  try{
    const params=new URL(request.url).searchParams,projectId=Number(params.get('projectId'));
    const access=await deliveryAccess(request,projectId);if(access instanceof NextResponse)return access;
    const rows=await sql!`SELECT id,project_id AS "projectId",title,description,owner,priority,labels,module_id AS "moduleId",cadence,every_n AS "everyN",start_date AS "startDate",end_date AS "endDate",enabled,created_by AS "createdBy",version,next_index AS "nextIndex",recurrence_due(start_date,cadence,every_n,next_index) AS "nextDueDate",last_run_at AS "lastRunAt",last_error AS "lastError" FROM recurring_schedules WHERE project_id=${projectId} AND NOT archived ORDER BY id`;
    return NextResponse.json(rows.map(row=>({...row,canEdit:access.user.accessRole!=='viewer'&&canEdit(access.user,access.project,row as {createdBy:string})})),{headers:{'Cache-Control':'no-store'}});
  }catch(e){return deliveryFailure(e);}
}
export async function POST(request:Request){return save(request,false);}
export async function PATCH(request:Request){return save(request,true);}
async function save(request:Request,editing:boolean){
  try{
    const input=await request.json().catch(()=>null),fields=['id','projectId','version','title','description','owner','priority','labels','moduleId','cadence','everyN','startDate','endDate','enabled'];
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!fields.includes(k))||editing&&(!positiveId(input.id)||!positiveId(input.version)))return NextResponse.json({error:'Provide valid schedule fields and the current revision when editing'},{status:400});
    const access=await deliveryAccess(request,input.projectId,true);if(access instanceof NextResponse)return access;
    let current:any=null;
    if(editing){const rows=await sql!`SELECT id,title,description,owner,priority,labels,module_id AS "moduleId",cadence,every_n AS "everyN",start_date AS "startDate",end_date AS "endDate",enabled,created_by AS "createdBy",version,next_index AS "nextIndex" FROM recurring_schedules WHERE id=${input.id} AND project_id=${input.projectId} AND NOT archived`;current=rows[0];if(!current)return NextResponse.json({error:'Schedule unavailable'},{status:404});if(!canEdit(access.user,access.project,current))return NextResponse.json({error:'Only the creator, project owner, or a manager can change this schedule'},{status:403});}
    const b={description:'',owner:access.user.name,priority:'Normal',labels:[],moduleId:null,everyN:1,endDate:null,enabled:true,...current,...input};
    const invalid=validateRecurrence(b);if(invalid)return NextResponse.json({error:invalid},{status:400});
    if(!editing){const earliest=new Date(Date.now()-31*86400000).toISOString().slice(0,10);if(b.startDate<earliest)return NextResponse.json({error:'New schedules can backfill at most 31 days'},{status:400});}
    if(editing&&current.nextIndex>0&&(b.cadence!==current.cadence||b.everyN!==current.everyN||b.startDate!==current.startDate))return NextResponse.json({error:'Pause this schedule and create a new one to change cadence after work has been generated'},{status:409});
    const owner=b.owner.trim(),labels=normalizeTaskLabels(b.labels);
    const result=await sql!.transaction([
      sql!`SELECT pg_advisory_xact_lock(hashtext('planning:' || ${String(b.projectId)}))`,
      editing?sql!`UPDATE recurring_schedules SET title=${b.title.trim()},description=${b.description},owner=${owner},priority=${b.priority},labels=ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(labels)}::jsonb)),module_id=${b.moduleId}::integer,cadence=${b.cadence},every_n=${b.everyN},start_date=${b.startDate}::date,end_date=${b.endDate}::date,enabled=${b.enabled},version=version+1,last_error=NULL WHERE id=${b.id} AND project_id=${b.projectId} AND version=${input.version} AND NOT archived AND EXISTS(SELECT 1 FROM employees WHERE name=${owner}) AND EXISTS(SELECT 1 FROM projects p WHERE p.id=${b.projectId} AND NOT p.archived AND (p.owner=${owner} OR EXISTS(SELECT 1 FROM project_members m WHERE m.project_name=p.name AND m.employee_name=${owner}))) AND (${b.moduleId}::integer IS NULL OR EXISTS(SELECT 1 FROM project_modules WHERE id=${b.moduleId} AND project_id=${b.projectId} AND NOT archived)) RETURNING id,title,version,enabled,recurrence_due(start_date,cadence,every_n,next_index) AS "nextDueDate"`
      :sql!`INSERT INTO recurring_schedules(project_id,title,description,owner,priority,labels,module_id,cadence,every_n,start_date,end_date,enabled,created_by) SELECT ${b.projectId},${b.title.trim()},${b.description},${owner},${b.priority},ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(labels)}::jsonb)),${b.moduleId}::integer,${b.cadence},${b.everyN},${b.startDate}::date,${b.endDate}::date,${b.enabled},${access.user.name} WHERE EXISTS(SELECT 1 FROM employees WHERE name=${owner}) AND EXISTS(SELECT 1 FROM projects p WHERE p.id=${b.projectId} AND NOT p.archived AND (p.owner=${owner} OR EXISTS(SELECT 1 FROM project_members m WHERE m.project_name=p.name AND m.employee_name=${owner}))) AND (${b.moduleId}::integer IS NULL OR EXISTS(SELECT 1 FROM project_modules WHERE id=${b.moduleId} AND project_id=${b.projectId} AND NOT archived)) RETURNING id,title,version,enabled,start_date AS "nextDueDate"`
    ],{isolationLevel:'ReadCommitted'});
    return result[1][0]?NextResponse.json(result[1][0],{status:editing?200:201}):NextResponse.json({error:'Schedule changed, or assignee/module access is unavailable. Refresh before retrying.'},{status:409});
  }catch(e){return deliveryFailure(e);}
}
export async function DELETE(request:Request){
  try{const b=await request.json().catch(()=>null);if(!b||!positiveId(b.id)||!positiveId(b.version))return NextResponse.json({error:'Choose a schedule revision'},{status:400});const access=await deliveryAccess(request,b.projectId,true);if(access instanceof NextResponse)return access;const result=await sql!.transaction([sql!`SELECT pg_advisory_xact_lock(hashtext('planning:' || ${String(b.projectId)}))`,sql!`UPDATE recurring_schedules SET archived=TRUE,enabled=FALSE,version=version+1 WHERE id=${b.id} AND project_id=${b.projectId} AND version=${b.version} AND NOT archived AND (created_by=${access.user.name} OR ${access.project.owner===access.user.name||['admin','manager'].includes(access.user.accessRole)}) RETURNING id`],{isolationLevel:'ReadCommitted'});return result[1][0]?NextResponse.json({ok:true}):NextResponse.json({error:'Schedule changed or cannot be edited by you'},{status:409});}catch(e){return deliveryFailure(e);}
}
