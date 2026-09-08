import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createInterviewEngine} from './interview-engine.mjs';
function fixture(){
  let clock=10000,id=0;const timers=new Map(),requests=[];
  const engine=createInterviewEngine({authenticate:async t=>t==='pc'?{accountId:'a'}:t==='other'?{accountId:'b'}:null,
    answer:async input=>{requests.push(input);return {answer:'参考答案',creditBalance:80}},now:()=>clock,
    schedule:(fn,ms)=>{const key=++id;timers.set(key,{fn,at:clock+ms});return key},unschedule:key=>timers.delete(key)});
  const call=(action,fields={})=>engine.handle({accountToken:'pc',action,...fields});
  const tick=async ms=>{clock+=ms;for(const[key,t]of [...timers])if(t.at<=clock){timers.delete(key);t.fn()}await new Promise(setImmediate)};
  return {engine,call,tick,requests};
}
test('incremental speech, duplicate delivery and context decisions happen server-side',async()=>{
  const f=fixture(),s=await f.call('openInterviewSession',{context:{audioMode:'demo',position:'开发工程师'}}),base={interviewSessionId:s.id};
  await f.call('ingestInterviewTranscript',{...base,sequence:1,text:'你如何',isFinal:false});
  await f.call('ingestInterviewTranscript',{...base,sequence:2,text:'你如何处理项目风险？',isFinal:true});
  await f.call('ingestInterviewTranscript',{...base,sequence:2,text:'你如何处理项目风险？',isFinal:true});
  await f.tick(181);assert.equal(f.requests.length,1);assert.equal(f.requests[0].question,'你如何处理项目风险？');
  await f.call('ingestInterviewTranscript',{...base,sequence:3,text:'你如何设计回滚方案？',isFinal:true});await f.tick(181);
  assert.equal(f.requests.length,2);assert.match(f.requests[1].context.recentConversation,/项目风险/);
  assert.equal((await f.call('pollInterviewSession',base)).tasks.length,2);f.engine.close();
});
test('foreign tokens, out of order messages, stop and expiry cannot dispatch answers',async()=>{
  const f=fixture(),s=await f.call('openInterviewSession'),base={interviewSessionId:s.id};
  await assert.rejects(f.call('pollInterviewSession',{...base,accountToken:'other'}));
  await assert.rejects(f.call('ingestInterviewTranscript',{...base,sequence:2,text:'如何设计系统？'}),e=>e.code==='SEQUENCE_GAP');
  await f.call('ingestInterviewTranscript',{...base,sequence:1,text:'如何设计系统？',isFinal:true});
  await f.call('stopInterviewSession',{...base,flush:false});await f.tick(1000);assert.equal(f.requests.length,0);
  await assert.rejects(f.call('ingestInterviewTranscript',{...base,sequence:2,text:'如何设计系统？'}));
  await f.tick(91000);await assert.rejects(f.call('pollInterviewSession',base));f.engine.close();
});
test('uncertain upstream result is attempted once, completed tasks remain pollable',async()=>{
  let attempts=0;const engine=createInterviewEngine({authenticate:async()=>({accountId:'a'}),answer:async()=>{attempts++;throw new Error('timeout')}});
  const call=(action,fields={})=>engine.handle({accountToken:'pc',action,...fields});
  const s=await call('openInterviewSession'),base={interviewSessionId:s.id,sequence:1,text:'如何处理项目风险？',source:'manual'};
  await call('ingestInterviewTranscript',base);await call('ingestInterviewTranscript',base);await new Promise(setImmediate);
  const result=await call('pollInterviewSession',base);assert.equal(attempts,1);assert.equal(result.tasks[0].status,'error');engine.close();
});
