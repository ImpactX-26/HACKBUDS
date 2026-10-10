'use client';
import Link from 'next/link';
import {workerPages,verifierPages} from '@/lib/portal';
export default function PortalShell({role,view,children}:{role:'worker'|'verifier'|'admin';view:string;children:React.ReactNode}){
 const pages=role==='worker'?workerPages:role==='verifier'?verifierPages:{overview:'Recovery Administration'};
 return <div className="gv-shell"><aside className="gv-sidebar"><Link href="/" className="gv-brand"><span>G</span> GigVault</Link><p className="gv-nav-label">{role==='worker'?'YOUR WORK PASSPORT':role==='verifier'?'VERIFICATION WORKSPACE':'ADMINISTRATION'}</p><nav aria-label={role+' navigation'}>{Object.entries(pages).map(([key,label],i)=><Link key={key} href={'/'+role+(key==='overview'?'':'/'+key)} className={view===key?'active':''} aria-current={view===key?'page':undefined}><span className="gv-nav-icon">{['◈','▣','▤','◉','↗','◇','⌁','○'][i]}</span>{label}</Link>)}</nav><div className="gv-sidebar-foot"><span className="gv-live-dot"/> Local test network<p>Your financial evidence stays private.</p><Link href="/">Public home ↗</Link></div></aside><div className="gv-workspace"><header className="gv-topbar"><span>GigVault / {pages[view]}</span><span className="gv-tag">{role==='worker'?'Worker workspace':role==='verifier'?'Verifier workspace':'Restricted admin'}</span></header><main className="gv-content">{children}</main></div></div>;
}
