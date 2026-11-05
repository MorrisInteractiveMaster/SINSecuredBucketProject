import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { initializeFirestore, connectFirestoreEmulator, memoryLocalCache, doc, setDoc, getDoc, getDocs, collection, writeBatch, Bytes, serverTimestamp, updateDoc, deleteDoc } from 'firebase/firestore';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { openPortalDatabase } from '../src/firebase/portal-db.mjs';
if(process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' || process.env.GCLOUD_PROJECT !== 'demo-mi-sin-portal') throw new Error('Explicit demo emulator environment required');
const project='demo-mi-sin-portal', database='mi-sin-portal', apps=[];
const base=`http://127.0.0.1:8080/v1/projects/${project}/databases/`;
const ownerHeaders={'Authorization':'Bearer owner','Content-Type':'application/json'};
const closed=process.env.MI_TEST_CLOSED === '1';
let counter=0;
function client(uid,email='contractor@example.com',verified=true,dbId=database) {
 const mock=uid?{sub:uid,email,email_verified:verified,firebase:{sign_in_provider:'password'}}:undefined;
 let app,db;
 if(dbId===database){({app,db}=openPortalDatabase({projectId:project,databaseId:database,emulatorHost:'127.0.0.1',emulatorPort:8080,appName:`proof-${++counter}`,mockUserToken:mock}));}
 else {app=initializeApp({projectId:project,apiKey:'demo-only',appId:'demo'},`sentinel-${++counter}`);db=initializeFirestore(app,{localCache:memoryLocalCache()},dbId);connectFirestoreEmulator(db,'127.0.0.1',8080,mock?{mockUserToken:mock}:undefined);}
 apps.push(app);return db;
}
async function seed(dbId,path,fields) {
 const r=await fetch(`${base}${dbId}/documents/${path}`,{method:'PATCH',headers:ownerHeaders,body:JSON.stringify({fields})});
 assert.equal(r.ok,true,`Synthetic emulator seeding failed: ${r.status}`);
}
const invitation=(email)=>({email:{stringValue:email},keyId:{stringValue:'synthetic-key'},expiresAt:{timestampValue:new Date(Date.now()+3600000).toISOString()}});
function submit(db,id) {
 const b=writeBatch(db);b.set(doc(db,'submissionSlots',id),{uid:'contractor',createdAt:serverTimestamp()});
 b.set(doc(db,'encryptedRecords',id),{uid:'contractor',createdAt:serverTimestamp(),keyId:'synthetic-key',ciphertext:Bytes.fromUint8Array(new Uint8Array(512).fill(7))});
 return b.commit();
}
before(async()=>{
 for(const dbId of [database,'existing-app-sentinel','(default)']) {
  const r=await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${project}/databases/${dbId}/documents`,{method:'DELETE'});assert.equal(r.ok,true);
 }
 await seed(database,'policy/review',{mode:{stringValue:'synthetic-emulator-only'}});
 await seed(database,'roles/manager',{invitationManager:{booleanValue:true}});
 for(const id of ['own','race','partial']) await seed(database,`invitations/${id}`,invitation('contractor@example.com'));
 for(const dbId of ['existing-app-sentinel','(default)']) await seed(dbId,'existingData/sentinel',{value:{stringValue:'unchanged-synthetic-only'}});
});
after(async()=>{await Promise.all(apps.map(deleteApp));});
if(closed){
 test('actual deployment-candidate gate denies every client role and operation',async()=>{
  for(const uid of [null,'contractor','manager','custodian','auditor']){
   const db=client(uid);await assertFails(getDoc(doc(db,'invitations','own')));await assertFails(getDocs(collection(db,'encryptedRecords')));
   await assertFails(submit(db,'own'));await assertFails(updateDoc(doc(db,'invitations','own'),{email:'changed@example.org'}));await assertFails(deleteDoc(doc(db,'invitations','own')));
  }
 });
}else{
 test('verified invited contractor can read own invitation; unauthorized and unverified clients denied',async()=>{
  await assertSucceeds(getDoc(doc(client('contractor'),'invitations','own')));
  for(const db of [client(null),client('outsider','outsider@example.org'),client('contractor','contractor@example.com',false)]) await assertFails(getDoc(doc(db,'invitations','own')));
 });
 test('only portal invitation manager can create a bounded invitation; role escalation denied',async()=>{
  const d={email:'another@example.org',keyId:'synthetic-key',expiresAt:new Date(Date.now()+3600000)};
  await assertSucceeds(setDoc(doc(client('manager','manager@example.org'),'invitations','managed'),d));
  await assertFails(setDoc(doc(client('outsider'),'invitations','unapproved'),d));
  await assertFails(setDoc(doc(client('outsider'),'roles','outsider'),{invitationManager:true}));
  await assertFails(setDoc(doc(client('manager'),'invitations','oversized'),{...d,email:'x'.repeat(300)}));
 });
 test('one accepted batch; contractor and ordinary manager cannot read or mutate ciphertext',async()=>{
  const db=client('contractor');await assertSucceeds(submit(db,'own'));await assertFails(submit(db,'own'));
  for(const who of [db,client('manager'),client('custodian')]) await assertFails(getDoc(doc(who,'encryptedRecords','own')));
  await assertFails(updateDoc(doc(db,'encryptedRecords','own'),{ciphertext:'plaintext-forbidden'}));
  await assertFails(deleteDoc(doc(db,'submissionSlots','own')));
 });
 test('partial submission and schema pollution fail',async()=>{
  const db=client('contractor');await assertFails(setDoc(doc(db,'submissionSlots','partial'),{uid:'contractor',createdAt:serverTimestamp()}));
  await assertFails(setDoc(doc(db,'encryptedRecords','partial'),{uid:'contractor',createdAt:serverTimestamp(),keyId:'synthetic-key',ciphertext:'not-bytes',extra:'forbidden'}));
 });
 test('20 concurrent batch submissions produce one successful record/slot',async()=>{
  const results=await Promise.allSettled(Array.from({length:20},()=>submit(client('contractor'),'race')));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 });
}
test('portal accounts cannot access synthetic existing database; portal writes do not change existing sentinels',async()=>{
 for(const dbId of ['existing-app-sentinel','(default)']){
  const db=client('contractor','contractor@example.com',true,dbId);
  await assertFails(getDoc(doc(db,'existingData','sentinel')));await assertFails(setDoc(doc(db,'encryptedRecords','wrong-database'),{synthetic:true}));
  const r=await fetch(`${base}${dbId}/documents/existingData/sentinel`,{headers:ownerHeaders});const data=await r.json();assert.equal(data.fields.value.stringValue,'unchanged-synthetic-only');
  const absent=await fetch(`${base}${dbId}/documents/encryptedRecords/own`,{headers:ownerHeaders});assert.equal(absent.status,404);
 }
});
