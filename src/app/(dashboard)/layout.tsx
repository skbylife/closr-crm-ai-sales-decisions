import Link from 'next/link';
export default function DashboardLayout({children}:{children:React.ReactNode}) {
  return <><header style={{padding:16,borderBottom:'1px solid #dde2e8'}}><Link href="/accounts">Closr Community · 客户</Link></header><main>{children}</main></>;
}
