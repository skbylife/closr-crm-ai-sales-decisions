import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { communitySession } from '@/lib/community/session';
import { requireAdmin } from '@/lib/api-guard';
import { StrategicPlayTab } from './components/strategic-play-tab';
export default async function AccountPage({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  const session=await communitySession();if(!session)redirect('/login');
  if(!await session.canAccess(session.principal,id))notFound();
  const admin=requireAdmin();
  const [{data:account,error:accountError},{data:opportunities,error:opportunityError}]=await Promise.all([
    admin.from('accounts').select('id,name').eq('id',id).eq('org_id',session.principal.orgId).single(),
    admin.from('opportunities').select('id,name').eq('account_id',id).eq('org_id',session.principal.orgId).limit(100),
  ]);
  if(accountError||!account||opportunityError)notFound();
  return <section><Link href="/accounts">← 返回客户</Link><h1>{account.name}</h1><StrategicPlayTab account={{id:account.id,name:account.name,contacts:[]}} opportunities={opportunities??[]}/></section>;
}
