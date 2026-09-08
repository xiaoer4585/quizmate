import { postAction } from '../apiClient';
export const PROTECTED_API = 'https://api.quizmate.vip/companion-test/api';
export interface RemoteTask { id: string; question: string; answer?: string; keyPoints?: string[]; status: 'pending' | 'streaming' | 'done' | 'error'; error?: string; ts: number; }
export interface RemoteSnapshot { revision: number; tasks: RemoteTask[]; transcript: string; skipped: boolean; stopped: boolean; creditBalance?: number; }

/** Transport and lifecycle only; all question decisions execute on the server. */
export class ProtectedInterviewTransport {
  private id='';
  private token='';
  private sequence=0;
  private generation=0;
  private revision=-1;
  private timer?: NodeJS.Timeout;
  private polling=false;
  private queue: Promise<void>=Promise.resolve();
  private queued=0;
  private stopped=false;
  constructor(private getToken:()=>string|null|undefined,private receive:(value:RemoteSnapshot)=>void,private failed:(message:string)=>void){}
  active(){return !!this.id&&!this.stopped}
  async open(context:unknown,deviceId:string){
    this.close();const token=this.getToken();if(!token)throw new Error('请先登录');
    const generation=this.generation;this.token=token;
    const value=await postAction<{id:string}>(PROTECTED_API,'openInterviewSession',{context,deviceId},{token,timeoutMs:15000});
    if(generation!==this.generation||token!==this.getToken()){
      void postAction(PROTECTED_API,'closeInterviewSession',{interviewSessionId:value.id},{token,timeoutMs:5000}).catch(()=>{});
      throw new Error('面试启动已取消');
    }
    this.id=value.id;this.sequence=0;this.revision=-1;this.stopped=false;this.queue=Promise.resolve();this.queued=0;
    this.timer=setInterval(()=>void this.poll(),500);await this.poll();
    if(generation!==this.generation||!this.id)throw new Error('面试连接未建立，请重新开始');
  }
  async ingest(text:string,isFinal:boolean,source:'voice'|'manual'='voice',force=false){
    if(!this.id||this.stopped)return;
    if(this.queued>=30){this.failed('转写同步积压，请停止面试后重试');this.close();return}
    const generation=this.generation;this.queued++;
    const operation=async()=>{
      if(generation!==this.generation)return;
      const sequence=++this.sequence;
      // Reusing sequence makes transport retries idempotent; AI is never retried here.
      for(let attempt=0;attempt<2;attempt++){
        try{await this.call('ingestInterviewTranscript',{text,isFinal,source,force,sequence});return}
        catch(error){if(attempt===1||generation!==this.generation)throw error}
      }
    };
    this.queue=this.queue.then(operation).catch(error=>{
      if(generation===this.generation){this.failed(error instanceof Error?error.message:'转写同步失败');this.close()}
    }).finally(()=>{if(generation===this.generation)this.queued--});
    return this.queue;
  }
  async stop(flush:boolean){
    if(!this.id)return;
    const generation=this.generation;this.stopped=true;
    if(flush)await this.queue;
    if(generation!==this.generation)return;
    await this.call('stopInterviewSession',{flush});await this.poll();
    // Keep final results readable briefly; idle sessions expire at the server.
    const timer=setTimeout(()=>{if(generation===this.generation)this.close()},60000);timer.unref();
  }
  close(){
    const id=this.id,token=this.token;this.id='';this.token='';this.generation++;this.stopped=true;clearInterval(this.timer);
    if(id&&token)void postAction(PROTECTED_API,'closeInterviewSession',{interviewSessionId:id},{token,timeoutMs:5000}).catch(()=>{});
  }
  private call<T>(action:string,fields:Record<string,unknown>={}):Promise<T>{
    if(!this.id||this.getToken()!==this.token){this.close();return Promise.reject(new Error('登录状态已变化，请重新开始面试'))}
    return postAction<T>(PROTECTED_API,action,{interviewSessionId:this.id,...fields},{token:this.token,timeoutMs:15000});
  }
  private async poll(){
    if(!this.id||this.polling)return;this.polling=true;const generation=this.generation;
    try{const value=await this.call<RemoteSnapshot>('pollInterviewSession');if(generation!==this.generation)return;if(value.revision!==this.revision){this.revision=value.revision;this.receive(value)}}
    catch(error){if(generation===this.generation)this.failed(error instanceof Error?error.message:'面试连接中断')}
    finally{this.polling=false}
  }
}
