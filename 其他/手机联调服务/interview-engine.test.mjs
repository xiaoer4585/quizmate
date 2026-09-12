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
test('long estimation question remains one task when ASR emits final fragments',async()=>{
  const f=fixture(),s=await f.call('openInterviewSession',{context:{audioMode:'demo'}}),base={interviewSessionId:s.id};
  // 先有一轮上文，验证完整问题的请求仍携带本次面试上下文。
  await f.call('ingestInterviewTranscript',{...base,sequence:1,text:'请介绍一下你的项目经历',isFinal:true});
   await f.tick(181);
  const parts=['我出一个题目','你看怎么做','就是说昆山有100家理发店','请你猜测下昆山有多少人'];
  for(let i=0;i<parts.length;i++)await f.call('ingestInterviewTranscript',{...base,sequence:i+2,text:parts[i],isFinal:true});
   await f.tick(6001);
  assert.equal(f.requests.length,2);
  assert.equal(f.requests[1].question,'我出一个题目你看怎么做就是说昆山有100家理发店请你猜测下昆山有多少人');
  assert.match(f.requests[1].context.recentConversation,/项目经历/);
  assert.equal((await f.call('pollInterviewSession',base)).tasks.length,2);
  f.engine.close();
});
test('short request lead-ins wait for the next final fragment',async()=>{
  const f=fixture(),s=await f.call('openInterviewSession',{context:{audioMode:'formal'}}),base={interviewSessionId:s.id};
  await f.call('ingestInterviewTranscript',{...base,sequence:1,text:'请你介绍一下',isFinal:true});
  await f.tick(181);
  await f.call('ingestInterviewTranscript',{...base,sequence:2,text:'你的项目经历？',isFinal:true});
  await f.tick(181);
  assert.equal(f.requests.length,1);
  assert.equal(f.requests[0].question,'请你介绍一下你的项目经历？');
  f.engine.close();
});
test('punctuated ASR fragment does not close an existing long turn',async()=>{
  const f=fixture(),s=await f.call('openInterviewSession',{context:{audioMode:'formal'}}),base={interviewSessionId:s.id};
  await f.call('ingestInterviewTranscript',{...base,sequence:1,text:'我出一个题目。',isFinal:true});
  await f.tick(180);
  await f.call('ingestInterviewTranscript',{...base,sequence:2,text:'请你估算一下昆山有多少人口？',isFinal:true});
  await f.tick(180);
  assert.equal(f.requests.length,0);
  await f.tick(6001);
  assert.equal(f.requests.length,1);
  assert.equal(f.requests[0].question,'我出一个题目。请你估算一下昆山有多少人口？');
  f.engine.close();
});
test('request context is bounded before the answer call',async()=>{
  const f=fixture(),s=await f.call('openInterviewSession',{context:{audioMode:'formal',jobDescription:'J'.repeat(16000),resumeText:'R'.repeat(30000)}}),base={interviewSessionId:s.id};
  await f.call('ingestInterviewTranscript',{...base,sequence:1,text:'请介绍你的项目经历？',isFinal:true});
  await f.tick(181);
  assert.equal(f.requests.length,1);
  assert.ok(f.requests[0].context.jobDescription.length<=4000);
  assert.ok(f.requests[0].context.resumeText.length<=8000);
  f.engine.close();
});
test('long pauses between final fragments still flush one bounded question',async()=>{
  const f=fixture(),s=await f.call('openInterviewSession',{context:{audioMode:'formal'}}),base={interviewSessionId:s.id};
  const parts=['请你介绍一下','你的项目经历','以及你在其中遇到的最大挑战','并说明最后是怎么解决的？'];
  for(let i=0;i<parts.length;i++){
    await f.call('ingestInterviewTranscript',{...base,sequence:i+1,text:parts[i],isFinal:true});
    await f.tick(i===parts.length-1?181:5000);
  }
  await f.tick(6001);
  assert.equal(f.requests.length,1);
  assert.equal(f.requests[0].question,'请你介绍一下你的项目经历以及你在其中遇到的最大挑战并说明最后是怎么解决的？');
  f.engine.close();
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
