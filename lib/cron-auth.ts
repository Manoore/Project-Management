import {timingSafeEqual} from 'node:crypto';
export function cronConfigured(){return typeof process.env.CRON_SECRET==='string'&&process.env.CRON_SECRET.length>=32;}
export function validCronRequest(request:Request){const expected=`Bearer ${process.env.CRON_SECRET||''}`,actual=request.headers.get('authorization')||'';return cronConfigured()&&Buffer.byteLength(expected)===Buffer.byteLength(actual)&&timingSafeEqual(Buffer.from(expected),Buffer.from(actual));}
