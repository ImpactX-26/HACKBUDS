"use client";
import {useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {useSession} from "@/lib/session";
export default function Proof(){
 const {update}=useSession();const router=useRouter();const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 async function open(){setBusy(true);setError("");try{const d=await fetch("/api/backend/session").then(r=>r.json());if(!d.ok)throw Error(d.error);update({passport:{passportId:Number(d.passport.passportId),txHash:"",salt:""}});router.push("/passport");}catch(e:any){setError(e.message);}finally{setBusy(false);}}
 return <main className="wrap stack"><section className="card stack" style={{padding:32,gap:20}}><span className="pill">Your digital work identity</span><h1>Your work. Your passport.</h1><p className="lead">Carry your work history without sharing your bank statement. Review a provider's exact requirements, approve access, and prove eligibility privately.</p><div className="note">Your passport is anchored on the local blockchain. Each benefit requires a separate signed approval and proof.</div><button className="btn" disabled={busy} onClick={open}>{busy?"Reading your passport…":"Open my passport"}</button>{error&&<p className="note bad">{error}</p>}<Link href="/record">Review my work record</Link><details className="muted"><summary>Technical details</summary><p>This local session uses a seeded synthetic worker. The onboarding preview does not authenticate real Aadhaar or connect a live bank. Dashboard proofs and transactions execute on the local EVM.</p></details></section></main>;
}
