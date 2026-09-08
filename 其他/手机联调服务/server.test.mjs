import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRelay } from './server.mjs';

function fixture() {
  let time = 1000000, stored=[];
  const authenticate = async t => t==='pc'||t==='phone'?{accountId:'a',credits:100}:t==='other'?{accountId:'b',credits:100}:null;
  const run=createRelay({authenticate,now:()=>time,save:s=>{stored=structuredClone(s)}});
  return {run,authenticate,advance:ms=>{time+=ms},saved:()=>stored};
}
test('pairing is same-account, one-use, with independent device sessions',async()=>{
  const {run}=fixture(),p=await run({action:'createRelayPairing',accountToken:'pc'});
  await assert.rejects(run({action:'confirmRelayPairing',accountToken:'other',code:p.code}));
  await assert.rejects(run({action:'confirmRelayPairing',accountToken:'pc',code:p.code}));
  await run({action:'confirmRelayPairing',accountToken:'phone',code:p.code});
  await assert.rejects(run({action:'confirmRelayPairing',accountToken:'phone',code:p.code}));
});
test('pairing expires and old sessions are revoked by replacement',async()=>{
  const {run,advance}=fixture(),p=await run({action:'createRelayPairing',accountToken:'pc'});
  advance(300001);await assert.rejects(run({action:'confirmRelayPairing',accountToken:'phone',code:p.code}));
  await run({action:'createRelayPairing',accountToken:'pc'});
  await assert.rejects(run({action:'relayHeartbeat',accountToken:'pc',sessionId:p.sessionId}));
});
test('result replay never creates duplicates or downgrades completed cards; readers cannot publish',async()=>{
  const {run}=fixture(),p=await run({action:'createRelayPairing',accountToken:'pc'});
  await run({action:'confirmRelayPairing',accountToken:'phone',code:p.code});
  const card={id:'task-1',kind:'exam',status:'done',question:'题目',answer:'A',createdAt:1000000};
  await run({action:'publishRelayResult',accountToken:'pc',sessionId:p.sessionId,card:{...card,status:'pending',answer:''}});
  await run({action:'publishRelayResult',accountToken:'pc',sessionId:p.sessionId,card});
  await run({action:'publishRelayResult',accountToken:'pc',sessionId:p.sessionId,card});
  await run({action:'publishRelayResult',accountToken:'pc',sessionId:p.sessionId,card:{...card,status:'pending'}});
  await assert.rejects(run({action:'publishRelayResult',accountToken:'phone',sessionId:p.sessionId,card}));
  await assert.rejects(run({action:'getRelayEvents',accountToken:'other',sessionId:p.sessionId}));
  const d=await run({action:'getRelayEvents',accountToken:'phone',sessionId:p.sessionId});
  assert.equal(d.cards.length,1);assert.equal(d.nextSeq,2);assert.equal(d.cards[0].status,'done');assert.equal(d.cards[0].answer,'A');
});
test('saved state can be restored and contains only hashed tokens',async()=>{
  const f=fixture(),p=await f.run({action:'createRelayPairing',accountToken:'pc'});
  await f.run({action:'confirmRelayPairing',accountToken:'phone',code:p.code});
  assert.equal(f.saved()[0].desktop.length,64);assert.equal(f.saved()[0].mobile.length,64);
  const restored=createRelay({authenticate:f.authenticate,initial:f.saved(),now:()=>1000000});
  const d=await restored({action:'getRelayEvents',accountToken:'phone',sessionId:p.sessionId});assert.equal(d.connected,true);
  await restored({action:'revokeRelaySession',accountToken:'phone',sessionId:p.sessionId});
  await assert.rejects(restored({action:'getRelayEvents',accountToken:'phone',sessionId:p.sessionId}));
});
