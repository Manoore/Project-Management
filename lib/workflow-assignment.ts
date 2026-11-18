import { sql } from './db';
export async function resolveTaskWorkflow(body: Record<string, unknown>, projectName: string) {
  if (body.workflowStateId == null) return null;
  const rows=await sql!`SELECT s.category,p.id FROM project_workflow_states s JOIN projects p ON p.id=s.project_id WHERE s.id=${Number(body.workflowStateId)} AND p.name=${projectName} AND NOT p.archived`;
  if(!rows[0]) return 'Workflow stage is unavailable in this project';
  body.status=rows[0].category;
  return null;
}
