import {validCalendarDate,validateTaskInput} from './work-items';
export const positiveId=(n:unknown):n is number=>typeof n==='number'&&Number.isInteger(n)&&n>0&&n<=2147483647;
export function validateRecurrence(b:Record<string,unknown>){
  if(typeof b.title!=='string'||!b.title.trim()||b.title.trim().length>200||typeof b.description!=='string'||b.description.length>10000||typeof b.owner!=='string'||!b.owner.trim()||b.owner.length>200)return 'Provide a title, description, and project assignee';
  if(!['daily','weekly','monthly'].includes(String(b.cadence))||!Number.isInteger(b.everyN)||Number(b.everyN)<1||Number(b.everyN)>({daily:365,weekly:52,monthly:12}[String(b.cadence)]||0))return 'Choose a daily, weekly, or monthly interval';
  if(!validCalendarDate(b.startDate)||b.endDate!==null&&!validCalendarDate(b.endDate)||typeof b.endDate==='string'&&b.endDate<b.startDate)return 'Use valid start and end dates';
  if(b.startDate<'1970-01-01'||b.startDate>'2100-12-31'||typeof b.endDate==='string'&&b.endDate>'2100-12-31')return 'Use schedule dates between 1970 and 2100';
  if(typeof b.enabled!=='boolean'||b.moduleId!==null&&!positiveId(b.moduleId))return 'Choose a valid module and enabled state';
  return validateTaskInput({priority:b.priority,labels:b.labels});
}
export function validatePreferences(b:Record<string,unknown>){
  const allowed=['inApp','email','dailyDigest','dueReminders','quietHours','timeZone'];
  if(Object.keys(b).some(k=>!allowed.includes(k)))return 'Unknown notification preference';
  for(const key of ['inApp','email','dailyDigest','dueReminders'])if(key in b&&typeof b[key]!=='boolean')return 'Notification options must be true or false';
  if('timeZone' in b){if(typeof b.timeZone!=='string'||b.timeZone.length>80)return 'Use a valid time zone';try{new Intl.DateTimeFormat('en',{timeZone:b.timeZone});}catch{return 'Use a valid IANA time zone';}}
  if('quietHours' in b){const h=b.quietHours as Record<string,unknown>;if(!h||typeof h!=='object'||Array.isArray(h)||Object.keys(h).some(k=>!['enabled','start','end'].includes(k)))return 'Use enabled, start, and end for quiet hours';if('enabled' in h&&typeof h.enabled!=='boolean')return 'Quiet hours enabled must be true or false';for(const key of ['start','end'])if(key in h&&(typeof h[key]!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(h[key] as string)))return 'Use HH:MM times for quiet hours';if(h.enabled===true&&(!h.start||!h.end||h.start===h.end))return 'Quiet hours need different start and end times';}
  return null;
}
