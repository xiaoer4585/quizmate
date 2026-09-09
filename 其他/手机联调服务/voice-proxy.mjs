import crypto from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const fail=(message,code,status)=>Object.assign(new Error(message),{code,status});
export function createVoiceProxy({authenticate,loadConfig,publicUrl,now=Date.now,allowLocalUpstream=false}){
  const tickets=new Map(),connections=new Set(),issues=new Map();
  function sweep(){for(const [key,t]of tickets)if(t.expires<=now())tickets.delete(key);for(const [key,v]of issues)if(v.until<now())issues.delete(key)}
  const wsServer=new WebSocketServer({noServer:true,maxPayload:2*1024*1024,perMessageDeflate:false});
  return {
    sweep,
    async handle(input){
      const account=await authenticate(input.accountToken);if(!account?.accountId)throw fail('请先登录','AUTH_REQUIRED',401);
      if(account.credits!==undefined&&Number(account.credits)<=0)throw fail('积分不足，请充值后开始面试','INSUFFICIENT_CREDITS',402);
      const url=new URL('voice',publicUrl);url.protocol='wss:';
      if(input.action==='getVoiceProxyConfig')return {wsUrl:url.href,resourceId:'proxy',model:'bigmodel'};
      sweep();const rate=issues.get(account.accountId)||{count:0,until:now()+60000};
      if(++rate.count>20)throw fail('连接请求过多，请稍后重试','RATE_LIMIT',429);issues.set(account.accountId,rate);
      const ticket=crypto.randomBytes(32).toString('base64url');
      tickets.set(hash(ticket),{token:input.accountToken,accountId:account.accountId,expires:now()+30000});
      return {ticket,expiresAt:now()+30000};
    },
    attach(server){server.on('upgrade',async(req,socket,head)=>{
      let upstream,client;const url=new URL(req.url,'http://localhost');
      const reject=()=>{if(!socket.destroyed)socket.end('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')};
      if(url.pathname!==new URL('voice',publicUrl).pathname){reject();return}
      const ticket=tickets.get(hash(String(req.headers['x-quizmate-ticket']||'')));
      tickets.delete(hash(String(req.headers['x-quizmate-ticket']||'')));
      if(!ticket||ticket.expires<=now()){reject();return}
      // Reserve the slot before awaiting auth to avoid concurrent upgrade races.
      if([...connections].filter(c=>c.accountId===ticket.accountId).length>=2){reject();return}
      const connection={accountId:ticket.accountId,close:()=>{}};connections.add(connection);
      let monitor,lifetime;let closed=false;
      const cleanup=()=>{if(closed)return;closed=true;clearInterval(monitor);clearTimeout(lifetime);connections.delete(connection);upstream?.terminate();client?.terminate();if(!client)socket.destroy();ticket.token=''};
      connection.close=cleanup;socket.once('close',cleanup);
      try{
        const account=await authenticate(ticket.token);if(account?.accountId!==ticket.accountId||(account.credits!==undefined&&Number(account.credits)<=0))throw new Error('auth');
        const config=await loadConfig(ticket.token),upstreamUrl=new URL(config.wsUrl);
        if(!(upstreamUrl.protocol==='wss:'&&upstreamUrl.hostname==='openspeech.bytedance.com')&&!(allowLocalUpstream&&upstreamUrl.protocol==='ws:'&&upstreamUrl.hostname==='127.0.0.1'))throw new Error('upstream');
        if(closed)return;
        const requestId=crypto.randomUUID();
        upstream=new WebSocket(config.wsUrl,{handshakeTimeout:10000,maxPayload:2*1024*1024,headers:{'X-Api-Key':config.apiKey,'X-Api-Resource-Id':config.resourceId,'X-Api-Request-Id':requestId,'X-Api-Connect-Id':requestId,'X-Api-Sequence':'-1'}});
        upstream.once('error',cleanup);upstream.once('close',cleanup);
        upstream.once('open',()=>{
          if(closed)return;
          wsServer.handleUpgrade(req,socket,head,ws=>{
            client=ws;let bytes=0,windowAt=now();
            client.on('message',(data,isBinary)=>{
              if(now()-windowAt>1000){bytes=0;windowAt=now()}bytes+=data.length;
              if(bytes>2*1024*1024||upstream.bufferedAmount>2*1024*1024){cleanup();return}
              if(upstream.readyState===WebSocket.OPEN)upstream.send(data,{binary:isBinary});
            });
            upstream.on('message',(data,isBinary)=>{if(client.bufferedAmount>2*1024*1024){cleanup();return}if(client.readyState===WebSocket.OPEN)client.send(data,{binary:isBinary})});
            client.once('close',cleanup);client.once('error',cleanup);
            monitor=setInterval(()=>{void authenticate(ticket.token).then(a=>{if(a?.accountId!==ticket.accountId||(a.credits!==undefined&&Number(a.credits)<=0))cleanup()}).catch(cleanup)},30000);monitor.unref();
            lifetime=setTimeout(cleanup,2*60*60*1000);lifetime.unref();
          });
        });
      }catch{reject();cleanup()}
    })},
    close(){for(const c of connections)c.close();tickets.clear();wsServer.close()}
  };
}
