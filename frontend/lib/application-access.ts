import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {application} from './application-server';
// The cookie is only a locator: the backend validates session, role and OTP state.
export async function requirePortal(role:'worker'|'verifier'|'admin',next='/'+role){
 const token=(await cookies()).get('gv_application')?.value;
 const entry=(role==='worker'?'/signup':'/verifier-access')+'?next='+encodeURIComponent(next);
 if(!token)redirect(entry);
 let d:any;
 try{d=await (await application()).call('dashboard',{token});}catch{redirect(entry+'&expired=1');}
 if(d.role==='pending')redirect('/signup?next='+encodeURIComponent(next));
 if(d.role!==role)redirect(d.role==='worker'?'/worker':d.role==='verifier'?'/verifier':'/admin');
 if(role==='worker'&&!d.passport)redirect('/signup?next='+encodeURIComponent(next));
 return d;
}
