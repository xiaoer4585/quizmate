import { BrowserWindow } from 'electron';
import Store from 'electron-store';
import { ConfigHelper, type SavedInterviewContext } from '../ConfigHelper';
import { AuthManager } from '../AuthManager';
import { OverlayManager } from '../OverlayManager';
import { TtsHelper } from './TtsHelper';
import { ByteDanceTtsHelper } from './ByteDanceTtsHelper';
import { RealtimeVoiceHelper } from './RealtimeVoiceHelper';
import { ProtectedInterviewTransport, type RemoteSnapshot } from './ProtectedInterviewTransport';
import type { VoiceHealthSnapshot } from '../../shared/reliability';
import { createIdleVoiceSnapshot, isVoiceSessionActive } from '../../shared/reliability';
export interface InterviewContext {
  position?: string;
  company?: string;
  jobDescription?: string;
  jobDescriptionHtml?: string;
  resumeText?: string;
  resumeId?: string;
  language?: string;
  answerStyle?: 'concise' | 'detailed';
  audioMode?: 'demo' | 'formal';
}

export interface InterviewResume {
  id: string;
  name: string;
  text: string;
  uploadedAt: string;
  accountScope?: string;
}

export type InterviewTaskStatus = 'pending' | 'streaming' | 'done' | 'error';

export interface InterviewTask {
  id: string;
  question: string;
  answer?: string;
  keyPoints?: string[];
  error?: string;
  status: InterviewTaskStatus | 'skipped';
  ts: number;
}

interface InterviewStoreSchema {
  resumes: InterviewResume[];
  activeResumeId?: string;
  tasks: InterviewTask[];
}


export class InterviewHelper {
  private listening=false;
  private starting=false;
  private voiceState:VoiceHealthSnapshot=createIdleVoiceSnapshot();
  private context:InterviewContext={language:'zh',answerStyle:'concise'};
  private lastAnswer='';
  private clearedTasks = new Set<string>();
  private startup?:AbortController;
  private contextAccountScope='';
  private store:Store<InterviewStoreSchema>;
  private remote:ProtectedInterviewTransport;
  constructor(private configHelper:ConfigHelper, private authManager:AuthManager, private overlay:OverlayManager,
    private tts:TtsHelper, private byteDanceTts?:ByteDanceTtsHelper,private realtimeVoice?:RealtimeVoiceHelper,
    private companion?:{onEvent:(channel:string,payload:unknown)=>void}) {
    this.store=new Store<InterviewStoreSchema>({name:companion?'mobile-interview-data':'interview-data',defaults:{resumes:[],tasks:[]}});
    this.contextAccountScope=configHelper.getInterviewAccountScope();
    this.context={...this.context,...configHelper.getInterviewContext()};
    this.remote=new ProtectedInterviewTransport(()=>configHelper.getAuthToken(),value=>this.receive(value),message=>{
      this.stopCapture();this.remote.close();
      this.broadcast('interview:transcript',{error:message});
    });
  }
  isListening(){return this.starting||this.listening||isVoiceSessionActive(this.voiceState)}
  // ===== 简历管理 =====
  listResumes(): InterviewResume[] {
    const scope = this.configHelper.getInterviewAccountScope();
    return this.store.get('resumes').filter((resume) => resume.accountScope === scope);
  }

  addResume(id: string, name: string, text: string): InterviewResume {
    const scope = this.configHelper.getInterviewAccountScope();
    const resumes = this.store.get('resumes');
    const existing = resumes.find((r) => r.id === id && r.accountScope === scope);
    const resume: InterviewResume = { id, name, text, uploadedAt: new Date().toISOString(), accountScope: this.configHelper.getInterviewAccountScope() };
    if (existing) {
      Object.assign(existing, resume);
    } else {
      resumes.push(resume);
    }
    this.store.set('resumes', resumes);
    return resume;
  }

  deleteResume(id: string) {
    const scope = this.configHelper.getInterviewAccountScope();
    this.store.set('resumes', this.store.get('resumes').filter((r) => !(r.id === id && r.accountScope === scope)));
    if (this.store.get('activeResumeId') === id) {
      this.store.delete('activeResumeId');
      this.context.resumeText = undefined;
      this.context.resumeId = undefined;
    }
    this.persistContext();
  }

  setActiveResume(id: string | null) {
    if (!id) {
      this.store.delete('activeResumeId');
      this.context.resumeText = undefined;
      this.context.resumeId = undefined;
      this.persistContext();
      return;
    }
    const resume = this.listResumes().find((r) => r.id === id);
    if (!resume) return;
    this.store.set('activeResumeId', id);
    this.context.resumeText = resume.text;
    this.context.resumeId = id;
    this.persistContext();
  }

  getActiveResume(): InterviewResume | undefined {
    const id = this.store.get('activeResumeId');
    if (!id) return undefined;
    return this.listResumes().find((r) => r.id === id);
  }


  getTasks():InterviewTask[]{return this.store.get('tasks')}
  clearTasks(){for(const task of this.getTasks())this.clearedTasks.add(task.id);this.store.set('tasks',[]);this.overlay.renderTaskList([]);this.broadcast('interview:tasksCleared',{})}
  private receive(value:RemoteSnapshot){
    this.ensureContextAccountScope();
    const existing=this.getTasks();
    this.clearedTasks = new Set([...this.clearedTasks].filter(id => value.tasks.some(t => t.id === id)));
    for(const task of value.tasks){
      if(this.clearedTasks.has(task.id))continue;
      const previous=existing.find(t=>t.id===task.id);
      if(previous&&JSON.stringify(previous)===JSON.stringify(task))continue;
      this.store.set('tasks',[task,...this.getTasks().filter(t=>t.id!==task.id)].sort((a,b)=>b.ts-a.ts).slice(0,50));
      this.broadcast(previous?'interview:taskUpdated':'interview:taskAdded',task);
      if(task.status==='error')this.broadcast('interview:answer',{question:task.question,error:task.error,taskId:task.id});
      if(task.status==='done'){this.lastAnswer=task.answer||'';this.broadcast('interview:answer',{question:task.question,answer:task.answer,keyPoints:task.keyPoints,taskId:task.id})}
    }
    this.overlay.renderTaskList(this.getTasks());
    this.broadcast('interview:transcript',{text:value.transcript,isFinal:false,skipped:value.skipped,display:!value.skipped});
    if(typeof value.creditBalance==='number')this.broadcast('credits-updated',value.creditBalance);
  }
  async start(context?:InterviewContext){
    if(this.isListening())return;
    this.ensureContextAccountScope();if(context)this.setContext(context);
    this.context={...this.context,...this.configHelper.getInterviewContext()};
    if(!this.context.resumeText)this.context.resumeText=this.getActiveResume()?.text;
    this.starting=true;const startup=new AbortController();this.startup=startup;
    try{
      await this.remote.open(this.context,this.authManager.getDeviceId());startup.signal.throwIfAborted();
      await this.realtimeVoice?.start((text,isFinal)=>{void this.remote.ingest(text,isFinal)},
        error=>this.broadcast('interview:transcript',{error}),{audioMode:this.context.audioMode||'demo',signal:startup.signal,onState:s=>this.handleVoiceState(s)});
      startup.signal.throwIfAborted();this.listening=true;
      this.overlay.render({type:'interview',title:'面试助手已开启',content:'正在监听面试官提问…'});
      this.broadcast('interview:transcript',{status:'started',context:this.context,voiceState:this.voiceState});
    }catch(error){this.stopForWorkspace();throw error}finally{this.starting=false}
  }
  stop(){this.stopCapture();void this.remote.stop(true).catch(e=>this.broadcast('interview:transcript',{error:e.message}))}
  stopForWorkspace(){this.stopCapture();this.remote.close();if(this.companion)this.clearTasks()}
  private stopCapture(){this.startup?.abort();this.starting=false;this.listening=false;this.realtimeVoice?.stop(false);this.tts.stop();this.byteDanceTts?.stop();this.voiceState=createIdleVoiceSnapshot();this.broadcast('interview:stateChanged',this.voiceState);this.broadcast('interview:transcript',{status:'stopped'})}
  async restart(context?:InterviewContext){this.stopForWorkspace();if(context)this.setContext(context);await this.start()}
  toggle(){if(this.isListening())this.stop();else void this.start()}
  toggleListening(){this.toggle()}
  getRealtimeVoiceConfig(){return this.realtimeVoice?.getPublicConfig()??{provider:'unavailable'}}
  getVoiceState(){return this.realtimeVoice?.getHealthSnapshot()??{...this.voiceState}}
  async retryVoice(){await this.restart();return this.getVoiceState()}
  copyVoiceDiagnostic(){return this.realtimeVoice?.copyDiagnosticSummary()??false}
  openVoiceDiagnosticFolder(){return this.realtimeVoice?.openDiagnosticFolder()??Promise.resolve(false)}
  private handleVoiceState(snapshot:VoiceHealthSnapshot){this.voiceState={...snapshot};this.listening=isVoiceSessionActive(snapshot);this.broadcast('interview:stateChanged',snapshot)}
  replayLastAnswer(){if(!this.lastAnswer)return;if(this.byteDanceTts){this.byteDanceTts.cancel();void this.byteDanceTts.speak(this.lastAnswer)}else{this.tts.cancel();void this.tts.speak(this.lastAnswer)}}
  setContext(context: InterviewContext) {
    this.ensureContextAccountScope();
    this.context = { ...this.context, ...context };
    this.persistContext();
  }

  getContext(): SavedInterviewContext {
    const { position, company, jobDescription, jobDescriptionHtml, answerStyle, audioMode, resumeId } = this.context;
    return { position, company, jobDescription, jobDescriptionHtml, answerStyle, audioMode, resumeId };
  }

  saveContext(context: InterviewContext): SavedInterviewContext {
    this.setContext(context);
    return this.getContext();
  }

  private persistContext() {
    this.configHelper.setInterviewContext(this.getContext());
  }


  private ensureContextAccountScope(){const scope=this.configHelper.getInterviewAccountScope();if(scope===this.contextAccountScope)return;this.stopForWorkspace();this.contextAccountScope=scope;this.lastAnswer='';this.clearTasks();this.context={language:'zh',answerStyle:'concise',audioMode:'demo',...this.configHelper.getInterviewContext()}}
  async onTranscript(text:string){this.ensureContextAccountScope();if(!this.remote.active())await this.remote.open(this.context,this.authManager.getDeviceId());await this.remote.ingest(text,true,'manual')}
  async generateAnswer(question:string){this.ensureContextAccountScope();if(!this.remote.active())await this.remote.open(this.context,this.authManager.getDeviceId());await this.remote.ingest(question,true,'manual',true)}
  private broadcast(channel:string,payload:unknown){if(this.companion){this.companion.onEvent(channel,payload);return}for(const win of BrowserWindow.getAllWindows())if(!win.isDestroyed())win.webContents.send(channel,payload)}
}
