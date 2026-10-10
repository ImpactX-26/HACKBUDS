import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {openApplicationProfile} from '../local/application-profile.mjs';
const directory=()=>mkdtempSync(resolve('artifacts/','profile-regression-'));
test('one live process exclusively owns a durable profile',()=>{const root=directory(),profile=openApplicationProfile(root);try{assert.throws(()=>openApplicationProfile(root),/APPLICATION_PROFILE_IN_USE/);}finally{profile.close();}});
test('atomic account writes and stable configuration survive reopening',()=>{const root=directory(),first=openApplicationProfile(root);first.write('accounts.json',{version:1,workerCount:2});const seed=first.config.walletSeed;first.close();const next=openApplicationProfile(root);try{assert.ok(next.config.walletSeed===seed);assert.deepEqual(next.read('accounts.json'),{version:1,workerCount:2});assert.equal(existsSync(resolve(root,'accounts.json.tmp')),false);}finally{next.close();}});
test('corrupt configuration fails closed without resetting its contents or leaving a live lock',()=>{const root=directory(),profile=openApplicationProfile(root);profile.close();const file=resolve(root,'config.json');writeFileSync(file,'{"version":999}');assert.throws(()=>openApplicationProfile(root),/APPLICATION_PROFILE_VERSION_UNSUPPORTED/);assert.equal(readFileSync(file,'utf8'),'{"version":999}');assert.equal(existsSync(resolve(root,'owner.json')),false);});
