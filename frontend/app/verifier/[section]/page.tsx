import {notFound} from 'next/navigation';
import {requirePortal} from '@/lib/application-access';
import {verifierPages} from '@/lib/portal';
import ProductApplication from '@/components/ProductApplication';
export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{section:string}>;searchParams:Promise<{requestId?:string}>}){const {section}=await params;if(!verifierPages[section])notFound();const q=await searchParams;await requirePortal('verifier','/verifier/'+section+(q.requestId?'?requestId='+encodeURIComponent(q.requestId):''));return <ProductApplication role="verifier" view={section}/>;}