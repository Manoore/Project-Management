export function microsoftConfig(requestUrl:string){
  const clientId=process.env.MICROSOFT_CLIENT_ID||'',clientSecret=process.env.MICROSOFT_CLIENT_SECRET||'',tenantId=process.env.MICROSOFT_TENANT_ID||'';
  const guid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,missing:string[]=[];
  if(!guid.test(clientId))missing.push('MICROSOFT_CLIENT_ID');if(!clientSecret)missing.push('MICROSOFT_CLIENT_SECRET');if(!guid.test(tenantId))missing.push('MICROSOFT_TENANT_ID');
  const origin=new URL(requestUrl),redirectUri=process.env.MICROSOFT_REDIRECT_URI||new URL('/api/auth/microsoft/callback',origin).href;
  try{const redirect=new URL(redirectUri),local=['localhost','127.0.0.1','[::1]'].includes(redirect.hostname);if(redirect.origin!==origin.origin||redirect.pathname!=='/api/auth/microsoft/callback'||redirect.search||redirect.hash||redirect.username||redirect.password||(redirect.protocol!=='https:'&&!(redirect.protocol==='http:'&&local)))missing.push('MICROSOFT_REDIRECT_URI');}catch{missing.push('MICROSOFT_REDIRECT_URI');}
  return {configured:missing.length===0,missing,clientId,clientSecret,tenantId,redirectUri};
}
