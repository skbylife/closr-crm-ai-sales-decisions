import { nativeAuthGet, nativeAuthPost } from '@/lib/native-auth/handler';
export const runtime='nodejs';
export const GET=nativeAuthGet;
export async function POST(request:Request){return nativeAuthPost(request)}
