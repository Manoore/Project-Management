import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { deliveryAccess, deliveryFailure, validId } from '@/lib/delivery-access';
export async function GET(request:Request){
  try{
    const params=new URL(request.url).searchParams, projectId=Number(params.get('projectId'));
    const access=await deliveryAccess(request,projectId);if(access instanceof NextResponse)return access;
    if(params.has('history')){
      const id=Number(params.get('history'));if(!validId(id))return NextResponse.json({error:'Choose a document'},{status:400});
      return NextResponse.json(await sql!`SELECT v.version,v.title,v.body,v.author,v.created_at AS "createdAt" FROM project_document_versions v JOIN project_documents d ON d.id=v.document_id WHERE d.id=${id} AND d.project_id=${projectId} AND NOT d.archived ORDER BY v.version DESC`,{headers:{'Cache-Control':'no-store'}});
    }
    return NextResponse.json(await sql!`SELECT id,title,body,author,updated_by AS "updatedBy",version,updated_at AS "updatedAt" FROM project_documents WHERE project_id=${projectId} AND NOT archived ORDER BY updated_at DESC,id`,{headers:{'Cache-Control':'no-store'}});
  }catch(e){return deliveryFailure(e);}
}
export async function POST(request:Request){return save(request,false);}
export async function PATCH(request:Request){return save(request,true);}
async function save(request:Request,editing:boolean){
  try{
    const b=await request.json().catch(()=>null);
    if(!b||typeof b.title!=='string'||!b.title.trim()||b.title.trim().length>160||typeof b.body!=='string'||b.body.length>50000||editing&&(!validId(b.id)||!validId(b.version)))return NextResponse.json({error:'Use a title up to 160 characters and a document up to 50,000 characters'},{status:400});
    const access=await deliveryAccess(request,b.projectId,true);if(access instanceof NextResponse)return access;
    const rows=editing?await sql!`WITH changed AS(UPDATE project_documents SET title=${b.title.trim()},body=${b.body},updated_by=${access.user.name},version=version+1,updated_at=NOW() WHERE id=${b.id} AND project_id=${b.projectId} AND version=${b.version} AND NOT archived RETURNING *), revision AS(INSERT INTO project_document_versions(document_id,version,title,body,author) SELECT id,version,title,body,updated_by FROM changed), audit AS(INSERT INTO activity_events(employee_name,event_type,message) SELECT ${access.user.name},'document_updated','Updated document '||title FROM changed) SELECT id,title,body,author,updated_by AS "updatedBy",version,updated_at AS "updatedAt" FROM changed`
    :await sql!`WITH changed AS(INSERT INTO project_documents(project_id,title,body,author,updated_by) VALUES(${b.projectId},${b.title.trim()},${b.body},${access.user.name},${access.user.name}) RETURNING *), revision AS(INSERT INTO project_document_versions(document_id,version,title,body,author) SELECT id,version,title,body,updated_by FROM changed) SELECT id,title,body,author,updated_by AS "updatedBy",version,updated_at AS "updatedAt" FROM changed`;
    return rows[0]?NextResponse.json(rows[0],{status:editing?200:201}):NextResponse.json({error:'This document changed since you opened it. Copy your draft, reload, and merge your edits.'},{status:409});
  }catch(e){return deliveryFailure(e);}
}
export async function DELETE(request:Request){
  try{
    const b=await request.json().catch(()=>null);if(!b||!validId(b.id)||!validId(b.version))return NextResponse.json({error:'Choose a document revision'},{status:400});
    const access=await deliveryAccess(request,b.projectId,true);if(access instanceof NextResponse)return access;
    const rows=await sql!`UPDATE project_documents SET archived=TRUE,updated_by=${access.user.name},version=version+1,updated_at=NOW() WHERE id=${b.id} AND project_id=${b.projectId} AND version=${b.version} AND NOT archived RETURNING id`;
    return rows[0]?NextResponse.json({ok:true}):NextResponse.json({error:'Document changed or unavailable. Reload before archiving.'},{status:409});
  }catch(e){return deliveryFailure(e);}
}
