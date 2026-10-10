import {mkdirSync,existsSync,readFileSync,writeFileSync,renameSync,openSync,closeSync,unlinkSync,fsyncSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';

// Private LOCAL state. Never use this directory for uploaded evidence or session tokens.
export function openApplicationProfile(directory){
 if(!directory)return null;
 const root=resolve(directory);mkdirSync(root,{recursive:true,mode:0o700});
 const lock=resolve(root,'owner.json'),owner={pid:process.pid,token:randomUUID()};
 if(existsSync(lock)){
  const previous=JSON.parse(readFileSync(lock,'utf8'));if(!Number.isSafeInteger(previous.pid)||previous.pid<=0)throw Error('APPLICATION_PROFILE_LOCK_CORRUPTED');let alive=true;
  try{process.kill(previous.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;else throw e;}
  if(alive)throw Error('APPLICATION_PROFILE_IN_USE');unlinkSync(lock);
 }
 const fd=openSync(lock,'wx',0o600);try{writeFileSync(fd,JSON.stringify(owner));fsyncSync(fd);}finally{closeSync(fd);}
 const read=name=>{const file=resolve(root,name);return existsSync(file)?JSON.parse(readFileSync(file,'utf8')):null;};
 const write=(name,value)=>{const file=resolve(root,name),temp=file+'.tmp';const out=openSync(temp,'w',0o600);
  try{writeFileSync(out,JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v));fsyncSync(out);}finally{closeSync(out);}renameSync(temp,file);};
 try{
  let config=read('config.json');if(!config){config={version:1,walletSeed:randomBytes(32).toString('hex')};write('config.json',config);}
  if(config.version!==1)throw Error('APPLICATION_PROFILE_VERSION_UNSUPPORTED');
  return {root,config,read,write,close(){if(read('owner.json')?.token!==owner.token)throw Error('APPLICATION_PROFILE_LOCK_LOST');unlinkSync(lock);}};
 }catch(e){unlinkSync(lock);throw e;}
}
