import {NextResponse} from 'next/server';
import {application,APPLICATION_ORIGIN,token,sessionCookie} from '@/lib/application-server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const allowed=new Set(['info','publicPassport','challenge','login','logout','dashboard','onboardStart','onboardWallet','otpStart','otpMailbox','otpVerify',
  'loginOtpStart','loginOtpMailbox','loginOtpVerify',
  'phoneStart','phoneState','phoneMailbox','phoneVerify','phoneIdentity','managedTransaction',
  'identityCommit','recoveryStatus','actionChallenge','actionSubmit','revokeConsent','policyPrepare','policySubmit','approval','approve','reject',
  'localGas','applyService','consumerTransaction','transactionMined','repaymentTransaction','adminTransaction','recoveryAuthorize']);
export async function POST(request:Request,{params}:{params:Promise<{action:string}>}){
  try{
    if(request.headers.get('origin')!==APPLICATION_ORIGIN)return NextResponse.json({error:'ORIGIN_REJECTED'},{status:403});
    const {action}=await params;
    if(!allowed.has(action))return NextResponse.json({error:'METHOD_UNSUPPORTED'},{status:404});
    if(Number(request.headers.get('content-length')??0)>16384)return NextResponse.json({error:'INPUT_TOO_LARGE'},{status:413});
    const text=await request.text();if(text.length>16384)return NextResponse.json({error:'INPUT_TOO_LARGE'},{status:413});
    const p=text?JSON.parse(text):{},sessionToken=token(request);
    const flowToken=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith('gv_phone_flow='))?.slice('gv_phone_flow='.length);
    if(action.startsWith('phone')||action==='managedTransaction'){
      if(!['localhost','127.0.0.1','[::1]'].includes(new URL(APPLICATION_ORIGIN).hostname)||request.headers.get('host')!==new URL(APPLICATION_ORIGIN).host)return NextResponse.json({error:'LOCAL_PHONE_AUTH_DISABLED'},{status:403});
    }
    if(action.startsWith('phone')&&action!=='phoneStart'&&!flowToken)return NextResponse.json({error:'PHONE_FLOW_EXPIRED'},{status:401});
    if(!['info','publicPassport','challenge','login','logout'].includes(action)&&!action.startsWith('phone')&&!sessionToken)return NextResponse.json({error:'AUTHENTICATION_REQUIRED'},{status:401});
    const host=await application();
    const result=await host.call(action,{...p,token:sessionToken,flowToken});
    if(action==='phoneStart'){
      const {flowToken:newFlow,...safe}=result,response=NextResponse.json(safe,{headers:{'Cache-Control':'no-store'}});
      response.cookies.set('gv_phone_flow',newFlow,{httpOnly:true,sameSite:'strict',secure:false,path:'/',maxAge:300});return response;
    }
    if(action==='login'||action==='phoneIdentity'){
      const {token:loginToken,...safe}=result,response=NextResponse.json(safe,{headers:{'Cache-Control':'no-store'}});sessionCookie(response,loginToken);if(action==='phoneIdentity')response.cookies.set('gv_phone_flow','',{httpOnly:true,sameSite:'strict',path:'/',maxAge:0});return response;
    }
    const response=NextResponse.json(result,{headers:{'Cache-Control':'no-store'}});
    if(action==='logout'){sessionCookie(response,'');response.cookies.set('gv_phone_flow','',{httpOnly:true,sameSite:'strict',path:'/',maxAge:0});}return response;
  }catch(e:any){return NextResponse.json({error:e.code==='REQUEST_REJECTED'?e.message:e.code??'REQUEST_REJECTED'},
    {status:e.code==='AUTHENTICATION_REQUIRED'?401:400,headers:{'Cache-Control':'no-store'}});}
}
