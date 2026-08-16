// 查询指定 InvokeId 的执行结果
const crypto = require('crypto');
const AK_ID = process.env.OSS_AK_ID, AK_SECRET = process.env.OSS_AK_SECRET;
const INVOKE_ID = process.argv[2];
function pctEncode(s){return encodeURIComponent(s).replace(/'/g,'%27').replace(/\(/g,'%28').replace(/\)/g,'%29').replace(/\*/g,'%2A');}
function sign(method, canonicalQuery, secret){return crypto.createHmac('sha1', secret + '&').update(method + '&' + pctEncode('/') + '&' + pctEncode(canonicalQuery)).digest('base64');}
async function callEcs(params){
  const common = {Format:'JSON',Version:'2014-05-26',AccessKeyId:AK_ID,SignatureMethod:'HMAC-SHA1',Timestamp:new Date().toISOString().replace(/\.\d+Z$/,'Z'),SignatureVersion:'1.0',SignatureNonce:crypto.randomUUID(),RegionId:'cn-beijing',...params};
  const keys = Object.keys(common).sort();
  const canonical = keys.map((k)=>pctEncode(k)+'='+pctEncode(common[k])).join('&');
  const signature = sign('GET', canonical, AK_SECRET);
  const url = `https://ecs.cn-beijing.aliyuncs.com/?${keys.map((k)=>pctEncode(k)+'='+pctEncode(common[k])).join('&')}&Signature=${pctEncode(signature)}`;
  const res = await fetch(url); const text = await res.text();
  if(!res.ok) throw new Error(`API ${res.status}: ${text}`);
  return JSON.parse(text);
}
(async()=>{
  const det = await callEcs({Action:'DescribeInvocationResults',RegionId:'cn-beijing',InvokeId:INVOKE_ID,InstanceId:'i-2zedgehm045w1gsarawx'});
  const r = det.Invocation && det.Invocation.InvocationResults && det.Invocation.InvocationResults.InvocationResult && det.Invocation.InvocationResults.InvocationResult[0];
  if(!r){ console.log('NO_RESULT'); console.log(JSON.stringify(det,null,2).slice(0,500)); return; }
  console.log(`STATUS=${r.InvokeStatus} EXITCODE=${r.ExitCode}`);
  if(r.Output) console.log('---OUTPUT---\n' + Buffer.from(r.Output,'base64').toString('utf8') + '\n---END---');
  if(r.ErrorInfo) console.log('ERR:', r.ErrorInfo);
})().catch(e=>{console.error('FAIL',e.message);process.exitCode=1;});
