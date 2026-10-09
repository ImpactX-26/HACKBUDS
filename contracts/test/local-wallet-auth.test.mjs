import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Wallet} from 'ethers';
import {createLocalWalletAuth} from '../integration/local-wallet-auth.mjs';
const wallet=Wallet.createRandom(),other=Wallet.createRandom();
const domain={name:'GigVaultLocalSession',version:'1',chainId:1337,verifyingContract:wallet.address};
const make=()=>createLocalWalletAuth({domain,origin:'http://localhost:3000'});
test('public holder address cannot authenticate or create a session',()=>{
  const auth=make();for(const value of [undefined,wallet.address,'0x'+'ff'.repeat(32)])assert.throws(()=>auth.authenticate(value));
});
test('real wallet signature creates a session; nonce replay fails',async()=>{
  const auth=make(),c=auth.challenge(wallet.address),signature=await wallet.signTypedData(c.domain,c.types,c.value);
  const session=auth.login(c.value.nonce,signature);assert.equal(auth.authenticate(session.token),wallet.address);
  assert.throws(()=>auth.login(c.value.nonce,signature));auth.logout(session.token);assert.throws(()=>auth.authenticate(session.token));
});
test('another wallet, fabricated signature and modified challenge fail',async()=>{
  for(const sign of [c=>other.signTypedData(c.domain,c.types,c.value),()=>Promise.resolve('0x'+'ff'.repeat(65)),
    c=>wallet.signTypedData(c.domain,c.types,{...c.value,originHash:'0x'+'11'.repeat(32)})]){
    const auth=make(),c=auth.challenge(wallet.address);
    // Signature generation is asynchronous; login never trusts claimed wallet input.
    const awaited=await sign(c);assert.throws(()=>auth.login(c.value.nonce,awaited));
  }
});
test('challenge and session expire using wall time',async()=>{
  let time=100;const auth=createLocalWalletAuth({domain,origin:'http://localhost:3000',now:()=>time});
  const c=auth.challenge(wallet.address),sig=await wallet.signTypedData(c.domain,c.types,c.value);time=221;
  assert.throws(()=>auth.login(c.value.nonce,sig));
  const fresh=auth.challenge(wallet.address),session=auth.login(fresh.value.nonce,await wallet.signTypedData(fresh.domain,fresh.types,fresh.value));
  time+=1800;assert.throws(()=>auth.authenticate(session.token));
});
test('shutdown invalidates sessions',async()=>{
  const auth=make(),c=auth.challenge(wallet.address),s=auth.login(c.value.nonce,await wallet.signTypedData(c.domain,c.types,c.value));
  auth.close();assert.throws(()=>auth.authenticate(s.token));
});
