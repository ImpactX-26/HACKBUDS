import Link from 'next/link';
import Brand from './Brand';
export default function PublicShell({children}:{children:React.ReactNode}){return <><header className="gv-public-header"><Brand/><nav aria-label="Public navigation"><Link href="/lookup">Find a passport</Link><Link href="/verifier-access">For verifiers</Link><Link className="gv-button" href="/signup">Worker sign in</Link></nav></header>{children}<footer className="gv-footer"><span>GigVault · Your work. Your proof.</span><Link href="/development">Development environment</Link></footer></>;}
