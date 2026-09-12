import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRelay, startServer } from './server.mjs';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';

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

test('HTTP phone reads encrypted results and restart requires fresh reader login without AI or credit actions',async()=>{
  const actions=[];
  const auth=http.createServer(async(req,res)=>{
    let raw='';for await(const chunk of req)raw+=chunk;
    const input=JSON.parse(raw);actions.push(input.action);
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({ok:true,data:input.action==='loginAccount'?{token:'phone'}:{account:{accountId:'a',credits:80}}}));
  });
  auth.listen(0,'127.0.0.1');await once(auth,'listening');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'quizmate-relay-test-'));
  const names=['RELAY_PUBLIC_URL','RELAY_AUTH_ENDPOINT','RELAY_DATA_DIR','PORT','HOST'];
  const previous=Object.fromEntries(names.map(k=>[k,process.env[k]]));
  Object.assign(process.env,{RELAY_PUBLIC_URL:'https://relay.example/companion/',RELAY_AUTH_ENDPOINT:`http://127.0.0.1:${auth.address().port}`,RELAY_DATA_DIR:directory,PORT:'0',HOST:'127.0.0.1'});
  let server;
  try{
    server=startServer();await once(server,'listening');
    let base=`http://127.0.0.1:${server.address().port}/companion/`;
    const call=async input=>{const response=await fetch(`${base}api`,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://relay.example'},body:JSON.stringify(input)});return response.json()};
    assert.equal((await fetch(`${base}health`)).status,200);
    assert.match(await(await fetch(base)).text(),/双机协作/);
    const login=await call({action:'loginAccount',email:'fixture@example.test',password:'fixture-only'});assert.equal(login.data.token,'phone');
    const {data:p}=await call({action:'createRelayPairing',accountToken:'pc'});
    assert.match(p.phoneUrl,new RegExp(`#code=${p.code}&claim=.+`));
    const claim=new URL(p.phoneUrl).hash.match(/(?:^|&)claim=([^&]+)/)?.[1];assert.ok(claim);
    // 二维码中的一次性 claim 可直接完成配对，不需要在手机端输入账号密码。
    assert.equal((await call({action:'confirmRelayPairing',accountToken:claim,code:p.code})).ok,true);
    const card={id:'q1',kind:'interview',status:'pending',question:'中文问题',answer:'',createdAt:Date.now()};
    await call({action:'publishRelayResult',accountToken:'pc',sessionId:p.sessionId,card});
    await call({action:'publishRelayResult',accountToken:'pc',sessionId:p.sessionId,card:{...card,status:'done',answer:'中文回答'}});
    assert.equal(fs.readFileSync(path.join(directory,'sessions.enc')).includes(Buffer.from('中文回答')),false);
    const live=await call({action:'getRelayEvents',accountToken:claim,sessionId:p.sessionId});
    assert.equal(live.data.cards[0].answer,'中文回答');assert.equal(live.data.credits,80);
    await call({action:'closeMobileReader',accountToken:claim,sessionId:p.sessionId});
    assert.equal((await call({action:'getRelayEvents',accountToken:claim,sessionId:p.sessionId})).code,'READER_EXPIRED');
    // 关闭手机阅读器只撤销手机令牌，桌面端会话和已同步卡片仍保留，避免任务莫名消失。
    const desktopHeartbeat=await call({action:'relayHeartbeat',accountToken:'pc',sessionId:p.sessionId});assert.equal(desktopHeartbeat.data.connected,false);
    const desktopEvents=await call({action:'revokeRelaySession',accountToken:'pc',sessionId:p.sessionId});assert.equal(desktopEvents.data.revoked,true);
    await new Promise(resolve=>server.close(resolve));
    server=startServer();await once(server,'listening');base=`http://127.0.0.1:${server.address().port}/companion/`;
    const result=await call({action:'getRelayEvents',accountToken:'phone',sessionId:p.sessionId});
    assert.equal(result.code,'READER_EXPIRED');
    const denied=await fetch(`${base}api`,{method:'POST',headers:{Origin:'https://other.example'},body:'{}'});assert.equal(denied.status,403);
    assert.deepEqual([...new Set(actions)].sort(),['getAccountProfile','loginAccount','logoutAccount']);
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve));await new Promise(resolve=>auth.close(resolve));
    for(const key of names){if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key]}
    // This directory is created above by mkdtemp under the OS temp folder only.
    fs.rmSync(directory,{recursive:true,force:true});
  }
});
