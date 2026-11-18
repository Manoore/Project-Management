import {ensureDatabase,sql} from './db';
export async function runScheduledWork(at=new Date()){
  if(!await ensureDatabase())throw new Error('Database unavailable');
  try{const rows=await sql!`SELECT execute_daily_work(${at.toISOString()}::timestamptz) AS result`;return rows[0].result;}
  catch(error){const code=String((error as {code?:string}).code||'UNKNOWN').slice(0,20);try{await sql!`INSERT INTO scheduler_runs(status,error_code) VALUES('failed',${code})`;}catch{}throw new Error('Scheduled work failed. No partial job changes committed.');}
}
