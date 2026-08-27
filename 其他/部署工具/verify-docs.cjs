const https = require('https');
const get = (url) => new Promise((resolve, reject) => {
  https.get(url, { headers: { 'Cache-Control': 'no-cache' } }, (res) => {
    let buf = '';
    res.on('data', (c) => buf += c);
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: buf }));
  }).on('error', reject);
});

(async () => {
  const r = await get('https://www.quizmate.cn/docs.html');
  console.log('STATUS', r.status, 'LEN', r.body.length);
  console.log('CT', r.headers['content-type']);
  console.log('X-Cache', r.headers['x-cache'] || r.headers['via'] || r.headers['age']);
  const m = r.body.match(/每次 AI 作答消耗 (\d+) 积分/);
  console.log('CREDITS', m ? m[1] : null);
  const upd = r.body.match(/最后更新：([^<]+)/);
  console.log('UPDATED', upd ? upd[1] : null);
  console.log('HAS_AUDIOMODE', r.body.includes('听写模式'));
  console.log('HAS_MANUAL', r.body.includes('手动输入问题'));
  console.log('HAS_VOICE_MODE', r.body.includes('语音播报'));
  console.log('HAS_INTERVIEW_5_5', r.body.includes('id="interview-history"'));
  console.log('HAS_EXAM_VOICE', r.body.includes('id="exam-voice"'));
})();
