import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {WebSocket,WebSocketServer} from 'ws';
import {createVoiceProxy} from './voice-proxy.mjs';
test('ASR proxy keeps provider key server-side, forwards binary frames, consumes tickets and rejects expired tickets',async()=>{
  let clock=1000,headers;
  const upstream=new WebSocketServer({port:0,host:'127.0.0.1'});await once(upstream,'listening');
  upstream.on('connection',(ws,req)=>{headers=req.headers;ws.on('message',(data,binary)=>ws.send(data,{binary}))});
  const server=http.createServer();
  const proxy=createVoiceProxy({authenticate:async t=>t==='pc'?{accountId:'a'}:null,loadConfig:async()=>({wsUrl:`ws://127.0.0.1:${upstream.address().port}`,apiKey:'provider-secret-fixture',resourceId:'test'}),publicUrl:'https://relay.example/companion/',now:()=>clock,allowLocalUpstream:true});
  proxy.attach(server);server.listen(0,'127.0.0.1');await once(server,'listening');
  const url=`ws://127.0.0.1:${server.address().port}/companion/voice`;
  try{
    const config=await proxy.handle({action:'getVoiceProxyConfig',accountToken:'pc'});assert.equal(config.apiKey,undefined);
    const ticket=await proxy.handle({action:'createVoiceProxyTicket',accountToken:'pc'});assert.equal(ticket.apiKey,undefined);
    const client=new WebSocket(url,{headers:{'X-QuizMate-Ticket':ticket.ticket}});await once(client,'open');
    const message=once(client,'message');client.send(Buffer.from([1,2,3,4]));const[data,binary]=await message;assert.equal(binary,true);assert.deepEqual([...data],[1,2,3,4]);assert.equal(headers['x-api-key'],'provider-secret-fixture');
    const reject=t=>new Promise(resolve=>{const c=new WebSocket(url,{headers:{'X-QuizMate-Ticket':t}});c.on('error',()=>resolve());c.on('open',()=>{c.close();resolve('unexpected')})});
    assert.equal(await reject(ticket.ticket),undefined);
    const expired=await proxy.handle({action:'createVoiceProxyTicket',accountToken:'pc'});clock+=30001;assert.equal(await reject(expired.ticket),undefined);
    await assert.rejects(proxy.handle({action:'createVoiceProxyTicket',accountToken:'unknown'}));client.close();
  }finally{proxy.close();for(const c of upstream.clients)c.terminate();await new Promise(r=>upstream.close(r));await new Promise(r=>server.close(r))}
});
