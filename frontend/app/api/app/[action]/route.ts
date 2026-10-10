import {NextResponse} from 'next/server';
import {application,APPLICATION_ORIGIN,token,sessionCookie} from '@/lib/application-server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const allowed=new Set(['info','publicPassport','challenge','login','logout','dashboard','onboardStart','onboardWallet','otpStart','otpMailbox','otpVerify',
  'loginOtpStart','loginOtpMailbox','loginOtpVerify',
  'identityCommit','actionChallenge','actionSubmit','revokeConsent','policyPrepare','policySubmit','approval','approve','reject',
  'localGas','applyService','consumerTransaction','transactionMined','repaymentTransaction','adminTransaction','recoveryAuthorize']);
export async function POST(request:Request,{params}:{params:Promise<{action:string}>}){
  try{
    if(request.headers.get('origin')!==APPLICATION_ORIGIN)return NextResponse.json({error:'ORIGIN_REJECTED'},{status:403});
    const {action}=await params;
    if(!allowed.has(action))return NextResponse.json({error:'METHOD_UNSUPPORTED'},{status:404});
    if(Number(request.headers.get('content-length')??0)>16384)return NextResponse.json({error:'INPUT_TOO_LARGE'},{status:413});
    const text=await request.text();if(text.length>16384)return NextResponse.json({error:'INPUT_TOO_LARGE'},{status:413});
    const p=text?JSON.parse(text):{},sessionToken=token(request);
    if(!['info','publicPassport','challenge','login'].includes(action)&&!sessionToken)return NextResponse.json({error:'AUTHENTICATION_REQUIRED'},{status:401});
    const host=await application();
    const result=await host.call(action,{...p,token:sessionToken});
    if(action==='login'){
      const {token:loginToken,...safe}=result,response=NextResponse.json(safe);sessionCookie(response,loginToken);return response;
    }
    const response=NextResponse.json(result,{headers:{'Cache-Control':'no-store'}});
    if(action==='logout')sessionCookie(response,'');return response;
  }catch(e:any){return NextResponse.json({error:e.code==='REQUEST_REJECTED'?e.message:e.code??'REQUEST_REJECTED'},
    {status:e.code==='AUTHENTICATION_REQUIRED'?401:400,headers:{'Cache-Control':'no-store'}});}
}
