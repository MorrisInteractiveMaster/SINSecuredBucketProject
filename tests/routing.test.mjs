import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openPortalDatabase } from '../src/firebase/portal-db.mjs';
import { reviewedDeploymentPlan, PORTAL_DATABASE_ID } from '../config/portal-target.mjs';
const target = {projectId:'demo-mi-sin-portal',databaseId:PORTAL_DATABASE_ID,emulatorHost:'127.0.0.1',emulatorPort:8080};
test('SDK initialization always passes the named database and memory-only cache', () => {
  const calls=[]; const db={}; const app={}; const memory={};
  const sdk={initializeApp:(cfg)=>{calls.push(['app',cfg.projectId]);return app;}, memoryLocalCache:()=>memory,
    initializeFirestore:(a,c,id)=>{calls.push(['db',a,c,id]);return db;}, connectFirestoreEmulator:(...args)=>calls.push(['emulator',...args])};
  assert.equal(openPortalDatabase(target,sdk).db, db);
  assert.deepEqual(calls[1],['db',app,{localCache:memory},'mi-sin-portal']);
  assert.equal(calls[2][2],'127.0.0.1');
});
test('missing, default, unrelated and cloud targets fail before any SDK call', () => {
  for(const databaseId of [undefined,'','(default)','existing-app-sentinel']) assert.throws(()=>openPortalDatabase({...target,databaseId},{}));
  assert.throws(()=>openPortalDatabase({...target,projectId:'gen-lang-client-0948635471'},{}),/Cloud access disabled/);
  assert.throws(()=>openPortalDatabase({...target,emulatorHost:'remote.example'},{}));
});
test('reviewed config can target only portal resources and has no shared-service deploy blocks', () => {
  const config=JSON.parse(readFileSync(new URL('../firebase.mi-sin-portal.proposed.json',import.meta.url)));
  assert.equal(reviewedDeploymentPlan(config,'gen-lang-client-0948635471').firestoreSelector,'firestore:mi-sin-portal');
  for(const mutation of [c=>c.firestore[0].database='(default)',c=>c.firestore.push({...c.firestore[0],database:'other'}),c=>c.auth={},c=>c.functions={},c=>c.database={},c=>c.hosting.site='existing-site',c=>c.hosting.target='existing']) {
    const copy=structuredClone(config);mutation(copy);assert.throws(()=>reviewedDeploymentPlan(copy,'gen-lang-client-0948635471'));
  }
});
