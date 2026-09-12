import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterviewEngine } from './interview-engine.mjs';
import { createVoiceProxy } from './voice-proxy.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const fail = (message, code = 'RELAY_ERROR', status = 400) => Object.assign(new Error(message), { code, status });

export function createRelay({ authenticate, now = Date.now, save = () => {}, initial = [] }) {
  const sessions = new Map(initial.map(s => [s.id, s]));
  const attempts = new Map();
  const persist = () => save([...sessions.values()]);
  const handle = async input => {
    for (const [id, s] of sessions) if (s.expiresAt <= now()) sessions.delete(id);
    const account = await authenticate(input.accountToken);
    if (!account?.accountId) throw fail('请重新登录', 'AUTH_REQUIRED', 401);
    const tokenHash = hash(input.accountToken);
    if (input.action === 'createRelayPairing') {
      for (const [id, s] of sessions) if (s.accountId === account.accountId) sessions.delete(id);
      const code = String(crypto.randomInt(100000, 1000000));
      const id = crypto.randomUUID();
      const s = { id, accountId: account.accountId, desktop: tokenHash, mobile: '', codeHash: hash(code), pairExpires: now() + 300000,
        expiresAt: now() + 86400000, desktopSeen: now(), mobileSeen: 0, seq: 0, cards: [] };
      sessions.set(id, s); persist();
      return { sessionId: id, code, expiresAt: s.pairExpires };
    }
    if (input.action === 'confirmRelayPairing') {
      const key = account.accountId;
      const rate = attempts.get(key) || { count: 0, until: now() + 600000 };
      if (rate.until <= now()) { rate.count = 0; rate.until = now() + 600000; }
      attempts.set(key, rate);
      if (++rate.count > 10) throw fail('尝试过多，请稍后重试', 'RATE_LIMIT', 429);
      const s = [...sessions.values()].find(s => s.accountId === account.accountId && !s.mobile && s.pairExpires > now() && s.codeHash === hash(input.code));
      if (!s || s.desktop === tokenHash) throw fail('连接码无效或已过期，请使用同一账号重新配对', 'PAIRING_INVALID');
      s.mobile = tokenHash; s.codeHash = ''; s.mobileSeen = now(); persist();
      return { sessionId: s.id, expiresAt: s.expiresAt };
    }
    const s = sessions.get(String(input.sessionId));
    if (!s || s.accountId !== account.accountId || ![s.desktop, s.mobile].includes(tokenHash)) throw fail('连接已失效，请重新配对', 'RELAY_EXPIRED', 401);
    if (input.action === 'revokeRelaySession') { sessions.delete(s.id); persist(); return { revoked: true }; }
    if (input.action === 'relayHeartbeat') {
      if (tokenHash !== s.desktop) throw fail('权限不足', 'FORBIDDEN', 403);
      s.desktopSeen = now(); persist();
      return { connected: !!s.mobile && now() - s.mobileSeen < 15000 };
    }
    if (input.action === 'getRelayEvents') {
      if (tokenHash !== s.mobile) throw fail('权限不足', 'FORBIDDEN', 403);
      s.mobileSeen = now();
      return { connected: now() - s.desktopSeen < 15000, nextSeq: s.seq, cards: s.cards, credits: account.credits };
    }
    if (input.action === 'publishRelayResult') {
      if (tokenHash !== s.desktop) throw fail('权限不足', 'FORBIDDEN', 403);
      const c = input.card;
      if (!c || typeof c !== 'object' || !/^[a-zA-Z0-9:_-]{1,100}$/.test(c.id) || !['exam', 'interview'].includes(c.kind) || !['pending', 'done', 'error'].includes(c.status)) throw fail('结果格式无效');
      const card = { id: c.id, kind: c.kind, status: c.status, question: String(c.question || '').slice(0, 2000),
        answer: String(c.answer || '').slice(0, 16000), explanation: String(c.explanation || '').slice(0, 16000), error: String(c.error || '').slice(0, 500), createdAt: Number(c.createdAt) || now() };
      if (Buffer.byteLength(JSON.stringify(card)) > 65536) throw fail('结果过长');
      const old = s.cards.find(c => c.id === card.id);
      if (old && (old.status === 'done' && card.status !== 'done' || JSON.stringify(old) === JSON.stringify(card))) return { accepted: true, seq: s.seq };
      s.cards = [card, ...s.cards.filter(c => c.id !== card.id)].sort((a, b) => b.createdAt - a.createdAt).slice(0, 200);
      s.seq++; persist(); return { accepted: true, seq: s.seq };
    }
    throw fail('未知操作', 'UNKNOWN_ACTION');
  };
  // 手机页面刷新/切后台不应删除已经同步的题目；仅解除手机端令牌，桌面端仍可看到
  // 已保存卡片并在下一次配对前保持会话可撤销。桌面端显式 revokeRelaySession
  // 才会删除整个 relay 会话。
  handle.closeReader = tokenHash => { for (const s of sessions.values()) if (s.mobile === tokenHash) { s.mobile = ''; s.mobileSeen = 0; } persist(); };
  return handle;
}

export function startServer() {
  const publicUrl = new URL(process.env.RELAY_PUBLIC_URL || '');
  if (publicUrl.protocol !== 'https:' || publicUrl.username || publicUrl.password || publicUrl.search || publicUrl.hash) throw new Error('RELAY_PUBLIC_URL must be a clean HTTPS URL');
  if (!publicUrl.pathname.endsWith('/')) publicUrl.pathname += '/';
  const dataDir = process.env.RELAY_DATA_DIR || path.join(root, 'private-data');
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const keyPath = path.join(dataDir, 'key');
  if (!fs.existsSync(keyPath)) fs.writeFileSync(keyPath, crypto.randomBytes(32), { mode: 0o600 });
  const key = fs.readFileSync(keyPath);
  const dataPath = path.join(dataDir, 'sessions.enc');
  let initial = [];
  if (fs.existsSync(dataPath)) {
    const b = fs.readFileSync(dataPath); const d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28)); initial = JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString());
  }
  const save = value => {
    const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const body = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    fs.writeFileSync(`${dataPath}.tmp`, Buffer.concat([iv, cipher.getAuthTag(), body]), { mode: 0o600 });
    fs.renameSync(`${dataPath}.tmp`, dataPath);
  };
  const upstream = process.env.RELAY_AUTH_ENDPOINT || 'https://api.quizmate.vip/study-auth-api';
  const call = async (input, signal) => {
    const response = await fetch(upstream, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(15000) });
    const result = await response.json();
    if (!result.ok) throw fail(result.error || '账号服务不可用', result.code || 'AUTH_ERROR', response.status);
    return result.data;
  };
  const cache = new Map();
  const authenticate = async token => {
    if (typeof token !== 'string' || !token) throw fail('请先登录', 'AUTH_REQUIRED', 401);
    const h=hash(token),hit=cache.get(h);if(hit&&hit.expires>Date.now())return hit.account;
    const data=await call({action:'getAccountProfile',accountToken:token});
    if(cache.size>1000)cache.clear();cache.set(h,{account:data.account,expires:Date.now()+10000});return data.account;
  };
  const claims=new Map();
  const authenticateWithClaims=async token=>{ const claim=claims.get(hash(token)); if(claim&&claim.expires>Date.now()) return authenticate(claim.desktopToken); return authenticate(token); };
  const relay=createRelay({initial,save,authenticate:authenticateWithClaims});
  const interview=createInterviewEngine({authenticate:authenticateWithClaims,answer:(input,signal)=>call({action:'generateInterviewAnswer',...input},signal)});
  const voice=createVoiceProxy({authenticate:authenticateWithClaims,loadConfig:token=>call({action:'getAsrConfig',accountToken:token}),publicUrl:publicUrl.href});
  const readers=new Map();
  const claimAuth=authenticateWithClaims;
  const closeReader=async token=>{
    const h=hash(token);readers.delete(h);cache.delete(h);relay.closeReader(h);
    await call({action:'logoutAccount',accountToken:token});
  };
  const housekeeping=setInterval(()=>{
    interview.sweep();voice.sweep();
    for(const value of readers.values())if(value.until<=Date.now())void closeReader(value.token).catch(()=>{});
  },5000);housekeeping.unref();
  const rate = new Map();
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname.endsWith('/health')) { res.end('ok'); return; }
      if (req.method === 'GET' && url.pathname.endsWith('/')) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(fs.readFileSync(path.join(root, 'phone.html'))); return;
      }
      if (req.method !== 'POST' || !url.pathname.endsWith('/api')) throw fail('接口不存在', 'NOT_FOUND', 404);
      const origin = req.headers.origin;
      if (origin && origin !== publicUrl.origin) throw fail('请求来源不允许', 'ORIGIN_DENIED', 403);
      const ip = req.socket.remoteAddress === '127.0.0.1' ? String(req.headers['x-real-ip'] || req.socket.remoteAddress) : req.socket.remoteAddress; const slot = Math.floor(Date.now() / 60000);
      const limiter = rate.get(ip); const count = limiter?.slot === slot ? limiter.count + 1 : 1;
      if(rate.size>5000)rate.clear();rate.set(ip, { slot, count }); if (count > 600) throw fail('请求过于频繁', 'RATE_LIMIT', 429);
      const chunks = []; let bytes = 0;
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 250000) throw fail('请求过大', 'BODY_TOO_LARGE', 413); chunks.push(chunk); }
      const raw = Buffer.concat(chunks).toString('utf8');
      const input=JSON.parse(raw);let data;
      if(!input||typeof input!=='object'||Array.isArray(input))throw fail('请求格式无效');
      const claim=claims.get(hash(input.accountToken||''));
      const effectiveToken=claim&&claim.expires>Date.now()?claim.desktopToken:input.accountToken;
      const reader=readers.get(hash(input.accountToken||''));
      if(input.action==='loginAccount'){
        data=await call({action:'loginAccount',email:input.email,password:input.password,platform:'mobile-web-test',deviceId:input.deviceId});
        readers.set(hash(data.token),{token:data.token,until:Date.now()+600000});
      }else if(input.action==='closeMobileReader'||input.action==='logoutAccount'){
        if(!reader)throw fail('手机会话已结束','READER_EXPIRED',401);
        await closeReader(input.accountToken);data={closed:true};
      }else if(['confirmRelayPairing','getRelayEvents','readerHeartbeat'].includes(input.action)){
        if(input.action==='confirmRelayPairing' && claim && claim.expires>Date.now() && !reader){ readers.set(hash(input.accountToken),{token:input.accountToken,until:Date.now()+600000}); data=await relay({...input,accountToken:input.accountToken}); }
        else { if(!reader||reader.until<=Date.now())throw fail('手机会话已结束，请重新登录','READER_EXPIRED',401); reader.until=Date.now()+600000; if(input.action==='readerHeartbeat'){await claimAuth(input.accountToken);data={alive:true}}else data=await relay(input); }
      }else if(['openInterviewSession','ingestInterviewTranscript','pollInterviewSession','stopInterviewSession','closeInterviewSession'].includes(input.action))data=await interview.handle(input);
      else if(['getVoiceProxyConfig','createVoiceProxyTicket'].includes(input.action))data=await voice.handle(input);
      else data=await relay(input);
      if (input.action === 'createRelayPairing') { const claimToken=crypto.randomBytes(32).toString('base64url'); claims.set(hash(claimToken),{desktopToken:input.accountToken,expires:Date.now()+300000}); data.claimToken=claimToken; data.phoneUrl = `${publicUrl.href}#code=${data.code}&claim=${claimToken}`; }
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ok: true, data }));
    } catch (e) { res.statusCode = e.status || 400; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ok: false, code: e.code || 'RELAY_ERROR', error: e.code ? e.message : '服务暂时不可用' })); }
  });
  voice.attach(server);
  server.on('close',()=>{clearInterval(housekeeping);interview.close();voice.close();readers.clear()});
  server.listen(Number(process.env.PORT || 8235), process.env.HOST || '127.0.0.1');
  return server;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) startServer();


