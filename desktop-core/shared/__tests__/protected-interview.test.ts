import {afterEach,beforeEach,expect,test,vi} from 'vitest';
const mock=vi.hoisted(()=>({post:vi.fn()}));
vi.mock('../../electron/apiClient',()=>({postAction:mock.post}));
import {ProtectedInterviewTransport} from '../../electron/helpers/ProtectedInterviewTransport';
beforeEach(()=>{vi.useFakeTimers();vi.resetAllMocks();mock.post.mockImplementation(async(_url,action)=>action==='openInterviewSession'?{id:'session'}:action==='pollInterviewSession'?{revision:1,tasks:[],transcript:'',stopped:false}:{});});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers()});
test('transport forwards raw fragments and reuses sequence after response loss',async()=>{
  const client=new ProtectedInterviewTransport(()=> 'token',vi.fn(),vi.fn());await client.open({},'test-device');
  let fail=true;mock.post.mockImplementation(async(_url,action)=>{if(action==='ingestInterviewTranscript'&&fail){fail=false;throw new Error('network')}return {}});
  await client.ingest('你如何',false);await client.ingest('你如何处理项目风险？',true);
  const calls=mock.post.mock.calls.filter(c=>c[1]==='ingestInterviewTranscript');expect(calls.map(c=>c[2].sequence)).toEqual([1,1,2]);
  expect(calls[0][2].text).toBe('你如何');expect(mock.post.mock.calls.some(c=>c[1]==='generateInterviewAnswer')).toBe(false);client.close();
});
test('cancel during open revokes late remote session instead of starting it',async()=>{
  let complete!:(v:unknown)=>void;mock.post.mockImplementation(async(_url,action)=>action==='openInterviewSession'?new Promise(resolve=>{complete=resolve}):{});
  const receive=vi.fn(),client=new ProtectedInterviewTransport(()=> 'token',receive,vi.fn());
  const opening=client.open({},'test-device');client.close();complete({id:'late'});
  await expect(opening).rejects.toThrow('取消');expect(client.active()).toBe(false);expect(receive).not.toHaveBeenCalled();
  expect(mock.post.mock.calls.some(c=>c[1]==='closeInterviewSession'&&c[2].interviewSessionId==='late')).toBe(true);
});
test('account switch suppresses late answers and blocks new transcription',async()=>{
  let token='one';const receive=vi.fn(),failed=vi.fn(),client=new ProtectedInterviewTransport(()=>token,receive,failed);
  await client.open({},'test-device');receive.mockClear();token='two';await client.ingest('如何设计系统？',true);
  expect(client.active()).toBe(false);expect(receive).not.toHaveBeenCalled();expect(mock.post.mock.calls.some(c=>c[1]==='ingestInterviewTranscript')).toBe(false);
});
