import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {Wallet} from 'ethers';

// Local-only custody. Windows protects the encryption key with the current user's
// DPAPI identity. Other hosts use a separate 0600 key in a 0700 directory.
function protect(bytes,unprotect=false){
 if(process.platform!=='win32')return bytes;
 const operation=unprotect?'Unprotect':'Protect';
 const script=`Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $r=[Security.Cryptography.ProtectedData]::${operation}($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($r))`;
 try{return Buffer.from(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{input:bytes.toString('base64'),windowsHide:true,stdio:['pipe','pipe','pipe']}).toString(),'base64');}
 catch{throw Error('WALLET_KEY_PROTECTION_UNAVAILABLE');}
}
export function openManagedWallets(profile){
 const keyDirectory=resolve(profile.root,'wallet-protection');mkdirSync(keyDirectory,{recursive:true,mode:0o700});
 const keyFile=resolve(keyDirectory,'encryption-key.bin');
 const saved=profile.read('managed-wallets.json');
 if(saved&&!existsSync(keyFile))throw Error('WALLET_KEY_PROTECTION_MISSING');
 if(!existsSync(keyFile))writeFileSync(keyFile,protect(randomBytes(32)),{mode:0o600,flag:'wx'});
 const key=protect(readFileSync(keyFile),true);if(key.length!==32)throw Error('WALLET_KEY_PROTECTION_INVALID');
 if(saved&&saved.version!==1)throw Error('MANAGED_WALLET_VERSION_INVALID');
 const entries=new Map(saved?.entries??[]);
 const persist=()=>profile.write('managed-wallets.json',{version:1,entries:[...entries]});
 const signer=(identity,address)=>{
  const entry=entries.get(identity);if(!entry||entry.address.toLowerCase()!==address.toLowerCase())throw Error('MANAGED_WALLET_NOT_AVAILABLE');
  const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(entry.iv,'hex'));
  decipher.setAAD(Buffer.from(identity+':'+entry.address));decipher.setAuthTag(Buffer.from(entry.tag,'hex'));
  const bytes=Buffer.concat([decipher.update(Buffer.from(entry.ciphertext,'hex')),decipher.final()]);
  try{const wallet=new Wallet('0x'+bytes.toString('hex'));if(wallet.address!==entry.address)throw Error('MANAGED_WALLET_CORRUPTED');return wallet;}finally{bytes.fill(0);}
 };
 return {
  has(identity,address){return entries.get(identity)?.address.toLowerCase()===address?.toLowerCase();},
  provision(identity,phoneHash){
   const existing=entries.get(identity);if(existing){if(existing.phoneHash!==phoneHash)throw Error('IDENTITY_ALREADY_BOUND');return existing.address;}
   const wallet=Wallet.createRandom(),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
   cipher.setAAD(Buffer.from(identity+':'+wallet.address));
   const ciphertext=Buffer.concat([cipher.update(Buffer.from(wallet.privateKey.slice(2),'hex')),cipher.final()]);
   entries.set(identity,{address:wallet.address,phoneHash,iv:iv.toString('hex'),tag:cipher.getAuthTag().toString('hex'),ciphertext:ciphertext.toString('hex')});persist();return wallet.address;
  },
  signer,
  close(){key.fill(0);}
 };
}
