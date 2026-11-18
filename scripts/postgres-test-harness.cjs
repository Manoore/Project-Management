const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
const url=process.env.PEOPLEFLOW_TEST_DATABASE_URL;
if(!url||!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw Error('Use a disposable localhost PostgreSQL database');
const pg=require(path.resolve(process.env.PEOPLEFLOW_TEST_PG_MODULE||'../qa-runtime/node_modules/pg'));pg.types.setTypeParser(1082,v=>v);
const pool=new pg.Pool({connectionString:url,max:4}),secret='local-integration-cron-secret-0123456789';
function sql(strings,...values){let text=strings[0];for(let i=0;i<values.length;i++)text+=`$${i+1}${strings[i+1]}`;return{text,values,then(resolve,reject){return pool.query(text,values).then(r=>r.rows).then(resolve,reject);}};}
sql.transaction=async(input,options={})=>{const client=await pool.connect();try{await client.query(`BEGIN ISOLATION LEVEL ${options.isolationLevel==='Serializable'?'SERIALIZABLE':options.isolationLevel==='RepeatableRead'?'REPEATABLE READ':'READ COMMITTED'}${options.readOnly?' READ ONLY':''}`);const results=[];for(const q of typeof input==='function'?input(sql):input)results.push((await client.query(q.text,q.values)).rows);await client.query('COMMIT');return results;}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}};
const cache=new Map();
function load(file){const full=path.resolve(file);if(cache.has(full))return cache.get(full);const exports={};cache.set(full,exports);const requireApp=id=>id==='@neondatabase/serverless'?{neon:()=>sql}:id.startsWith('@/')?load(id.slice(2)+'.ts'):id.startsWith('.')?load(path.resolve(path.dirname(full),id+'.ts')):require(id);vm.runInNewContext(ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,process:{env:{DATABASE_URL:url,CRON_SECRET:secret}},console,Request,URL,Buffer,require:requireApp},{filename:full});return exports;}
const origin='https://operations.test';let cookie;
function request(route,body,method='POST',session=cookie){return new Request(origin+route,{method,headers:{origin,'content-type':'application/json',...(session?{cookie:session}:{})},...(method!=='GET'?{body:JSON.stringify(body||{})}:{})});}
async function checked(response,status){const data=await response.json();assert.equal(response.status,status,JSON.stringify(data));return data;}
module.exports={pool,load,request,checked,origin,secret,setCookie:value=>{cookie=value;}};
