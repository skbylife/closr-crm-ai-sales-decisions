import { NextResponse } from 'next/server';
import { isNativeDatabase } from '@/lib/database-backend';
import { setupRequired } from '@/lib/native-auth/service';
import { nativeAuthPost } from '@/lib/native-auth/handler';
export const runtime='nodejs';
export async function GET(){if(!isNativeDatabase())return NextResponse.json({error:"Native backend is not enabled"},{status:404});try{return NextResponse.json({setupRequired:await setupRequired()},{headers:{'Cache-Control':'no-store'}})}catch{return NextResponse.json({error:'Database setup unavailable'},{status:503})}}
export async function POST(request:Request){return nativeAuthPost(request,'setup')}
