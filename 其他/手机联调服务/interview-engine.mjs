import crypto from 'node:crypto';
import { ASR_FINAL_COMMIT_MS, ASR_SILENCE_COMMIT_MS, ASR_FRAGMENT_SETTLE_MS, normalizeTranscript, mergeFinalTranscript, mergeIncrementalTranscript, composeTranscript, isLikelyInterviewQuestion, isLikelyIncompleteInterviewFragment, limitInterviewRequestContext } from './interview-policy.mjs';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const fail=(message,code='INTERVIEW_SESSION_EXPIRED',status=401)=>Object.assign(new Error(message),{code,status});

export function createInterviewEngine({ authenticate, answer, now=Date.now, schedule=setTimeout, unschedule=clearTimeout }) {
  const sessions=new Map();
  const ownerCounts=new Map();
  function update(s){s.revision++}
  function expire(s){s.closed=true;unschedule(s.commitTimer);unschedule(s.draftTimer);for(const c of s.controllers)c.abort();s.token='';s.context={};s.turns=[];s.queue=[];s.pending='';s.finalized='';s.interim='';s.draft='';}
  function sweep(){for(const [id,s] of sessions)if(now()-s.seen>90000||now()>s.expires){expire(s);sessions.delete(id)}}
  function snapshot(s){return {revision:s.revision,tasks:s.tasks,transcript:s.transcript,skipped:s.skipped,stopped:s.stopped}}
  function commit(s){unschedule(s.commitTimer);const text=s.pending;s.pending='';s.finalized='';s.interim='';if(text)question(s,text,'voice')}
  function question(s,value,source='voice',force=false){
    if(s.closed||s.stopped)return;
    const text=normalizeTranscript(value);if(!text)return;
    s.transcript=text;s.skipped=false;update(s);
    if(!force&&!isLikelyInterviewQuestion(text,s.context.audioMode||'demo')){s.skipped=true;return}
    if(source==='voice'&&isLikelyIncompleteInterviewFragment(text)){
      s.draft=mergeFinalTranscript(s.draft,text);unschedule(s.draftTimer);
      s.draftTimer=schedule(()=>{const draft=s.draft;s.draft='';submit(s,draft)},ASR_FRAGMENT_SETTLE_MS);return;
    }
    const combined=source==='voice'&&s.draft?mergeFinalTranscript(s.draft,text):text;
    if(source==='voice'){unschedule(s.draftTimer);s.draft=''}
    submit(s,combined);
  }
  function submit(s,text){
    if(!text||s.closed||s.stopped)return;
    // Suppress short reconnect replays; distinct later repetitions still work.
    const previous=s.tasks.find(t=>t.question===text&&now()-t.ts<3000);if(previous)return;
    const recent=s.turns.filter(t=>now()-t.ts<3600000).slice(-100);
    const context={...s.context,...limitInterviewRequestContext({jobDescription:s.context.jobDescription,resumeText:s.context.resumeText,recentConversation:recent.map((t,i)=>`问题${i+1}：${t.text}`).join('\n')})};
    s.turns=[...recent,{text,ts:now()}];
    const task={id:crypto.randomUUID(),question:text,status:'pending',ts:now()};
    s.tasks=[task,...s.tasks].slice(0,50);update(s);
    if(s.queue.length>=12){task.status='error';task.error='待处理问题过多，请稍后继续';return}
    s.queue.push({task,context});pump(s);
  }
  async function processTask(s,{task,context}){
    const controller=new AbortController();s.controllers.add(controller);
    task.status='streaming';update(s);
    try{
      // No automatic retry: legacy billing API does not have interview idempotency.
      const result=await answer({accountToken:s.token,question:task.question,context,deviceId:s.deviceId},controller.signal);
      if(s.closed||controller.signal.aborted)return;
      Object.assign(task,{status:'done',answer:result.answer||'暂无答案',keyPoints:result.keyPoints});
      if(typeof result.creditBalance==='number')s.credits=result.creditBalance;
    }catch(error){if(!s.closed){task.status='error';task.error=controller.signal.aborted?'已停止，未继续请求答案':(error.code?error.message:'答案生成失败，请检查网络后重试')}}
    finally{s.controllers.delete(controller);s.active--;ownerCounts.set(s.accountId,Math.max(0,(ownerCounts.get(s.accountId)||1)-1));update(s);for(const other of sessions.values())if(other.accountId===s.accountId)pump(other)}
  }
  function pump(s){while(!s.closed&&s.queue.length&&s.active<2&&(ownerCounts.get(s.accountId)||0)<2){s.active++;ownerCounts.set(s.accountId,(ownerCounts.get(s.accountId)||0)+1);void processTask(s,s.queue.shift())}}
  return {
    sweep,
    close(){for(const s of sessions.values())expire(s);sessions.clear()},
    async handle(input){
      sweep();const account=await authenticate(input.accountToken);if(!account?.accountId)throw fail('请先登录','AUTH_REQUIRED');
      const owner=hash(input.accountToken);
      if(input.action==='openInterviewSession'){
        if([...sessions.values()].filter(s=>s.accountId===account.accountId&&!s.closed&&!s.stopped).length>=2)throw fail('面试会话过多，请先停止已有面试','SESSION_LIMIT',429);
        const incoming=input.context||{};const context={};
        for(const key of ['position','company','language','answerStyle','audioMode','jobDescription','resumeText'])if(typeof incoming[key]==='string')context[key]=incoming[key].slice(0,key==='resumeText'?30000:key==='jobDescription'?16000:500);
        const s={id:crypto.randomUUID(),owner,accountId:account.accountId,token:input.accountToken,context,deviceId:String(input.deviceId||'').slice(0,200),seen:now(),expires:now()+86400000,revision:0,lastSequence:0,tasks:[],queue:[],turns:[],controllers:new Set(),active:0,closed:false,stopped:false,pending:'',finalized:'',interim:'',draft:'',transcript:'',skipped:false};
        sessions.set(s.id,s);return {id:s.id};
      }
      const s=sessions.get(input.interviewSessionId);if(!s||s.owner!==owner||s.accountId!==account.accountId||s.closed)throw fail('面试连接已失效，请重新开始');s.seen=now();
      if(input.action==='pollInterviewSession')return {...snapshot(s),creditBalance:s.credits};
      if(input.action==='stopInterviewSession'){
        if(input.flush&&!s.stopped){commit(s);if(s.draft){const draft=s.draft;s.draft='';unschedule(s.draftTimer);submit(s,draft)}}
        s.stopped=true;unschedule(s.commitTimer);unschedule(s.draftTimer);
        if(!input.flush){for(const c of s.controllers)c.abort();for(const {task} of s.queue){task.status='error';task.error='听写已停止，未提交该问题'}s.queue=[];s.pending='';s.draft=''}
        update(s);return snapshot(s);
      }
      if(input.action==='closeInterviewSession'){expire(s);sessions.delete(s.id);return {closed:true}}
      if(input.action!=='ingestInterviewTranscript')throw fail('未知面试操作','UNKNOWN_ACTION',400);
      if(s.stopped)throw fail('面试已停止','INTERVIEW_STOPPED',409);
      const seq=Number(input.sequence);if(!Number.isSafeInteger(seq)||seq<1)throw fail('无效序号','INVALID_SEQUENCE',400);
      if(seq<=s.lastSequence)return {accepted:true,sequence:s.lastSequence};
      if(seq!==s.lastSequence+1)throw fail('转写顺序不连续，请重连','SEQUENCE_GAP',409);
      s.lastSequence=seq;const text=String(input.text||'').slice(0,10000);
      if(input.source==='manual'){question(s,text,'manual',input.force===true);return {accepted:true,sequence:seq}}
      if(input.isFinal){s.finalized=mergeFinalTranscript(s.finalized,text);s.interim=''}else{s.interim=mergeIncrementalTranscript(s.interim,text)}
      s.pending=composeTranscript(s.finalized,s.interim);s.transcript=s.pending;s.skipped=false;update(s);
      unschedule(s.commitTimer);s.commitTimer=schedule(()=>commit(s),input.isFinal?ASR_FINAL_COMMIT_MS:ASR_SILENCE_COMMIT_MS);
      return {accepted:true,sequence:seq};
    }
  };
}
