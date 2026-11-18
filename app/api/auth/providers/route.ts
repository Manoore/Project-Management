import {NextResponse} from 'next/server';
import {microsoftConfig} from '@/lib/microsoft-config';
export async function GET(request:Request){const config=microsoftConfig(request.url);return NextResponse.json({password:{enabled:true},microsoft:{configured:config.configured,setupRequired:config.missing}},{headers:{'Cache-Control':'no-store'}});}
