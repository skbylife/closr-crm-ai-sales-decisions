import Link from 'next/link';
import { redirect } from 'next/navigation';
import { communitySession } from '@/lib/community/session';
import { requireAdmin } from '@/lib/api-guard';
export default async function AccountsPage() {
  const session=await communitySession();if(!session)redirect('/login');
  const {data,error}=await requireAdmin().from('accounts').select('id,name,owner_id,user_id').eq('org_id',session.principal.orgId).order('name').limit(100);
  if(error)throw new Error('accounts_unavailable');
  const permitted=await Promise.all((data??[]).map(async row=>(await session.canAccess(session.principal,row.id))?{id:row.id,name:row.name}:null));
  const accounts=permitted.filter((row):row is {id:string;name:string}=>Boolean(row));
  return <section><h1>客户</h1>{accounts.length===0?<p>暂无可访问的客户。</p>:<ul>{accounts.map(row=><li key={row.id}><Link href={`/accounts/${encodeURIComponent(row.id)}`}>{row.name}</Link></li>)}</ul>}</section>;
}
