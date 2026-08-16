const fs = require('fs');
const path = require('path');

const siteRoot = path.resolve(__dirname, '../../官网模块/正式官网-quizmate.vip');
const requiredPages = [
  'index.html',
  'ai-written-test-assistant.html',
  'ai-interview-assistant.html',
  'campus-recruitment-ai-assistant.html',
  'career-ai-tools.html',
  'about.html',
  'privacy.html',
  'security.html',
  'changelog.html',
];

const errors = [];
const titles = new Map();
const canonicals = new Map();

function addUnique(map, value, file, label) {
  if (!value) return errors.push(`${file}: missing ${label}`);
  if (map.has(value)) errors.push(`${file}: duplicate ${label} with ${map.get(value)}: ${value}`);
  else map.set(value, file);
}

for (const file of requiredPages) {
  const full = path.join(siteRoot, file);
  if (!fs.existsSync(full)) {
    errors.push(`${file}: file missing`);
    continue;
  }
  const html = fs.readFileSync(full, 'utf8');
  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
  const canonical = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"/i)?.[1];
  const description = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i)?.[1];
  const h1Count = (html.match(/<h1(?:\s|>)/gi) || []).length;
  addUnique(titles, title, file, 'title');
  addUnique(canonicals, canonical, file, 'canonical');
  if (!description || description.length < 60) errors.push(`${file}: meta description is missing or too short`);
  if (h1Count !== 1) errors.push(`${file}: expected one H1, found ${h1Count}`);

  for (const match of html.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi)) {
    try { JSON.parse(match[1]); }
    catch (error) { errors.push(`${file}: invalid JSON-LD: ${error.message}`); }
  }

  for (const match of html.matchAll(/href="([^"]+)"/gi)) {
    const href = match[1];
    if (/^(?:https?:|mailto:|tel:|data:|#|javascript:)/i.test(href)) continue;
    const clean = href.split(/[?#]/)[0];
    if (!clean || clean.endsWith('/')) continue;
    const target = path.resolve(siteRoot, path.dirname(file), clean);
    if (!fs.existsSync(target)) errors.push(`${file}: broken internal link ${href}`);
  }
}

const sitemap = fs.readFileSync(path.join(siteRoot, 'sitemap.xml'), 'utf8');
for (const file of requiredPages) {
  const expected = file === 'index.html' ? 'https://www.quizmate.vip/' : `https://www.quizmate.vip/${file}`;
  if (!sitemap.includes(`<loc>${expected}</loc>`)) errors.push(`sitemap.xml: missing ${expected}`);
}
if (/-2\.html<\/loc>/.test(sitemap)) errors.push('sitemap.xml: duplicate-suffix URL remains');

const llms = fs.readFileSync(path.join(siteRoot, 'llms.txt'), 'utf8');
for (const term of ['AI笔试助手', 'AI面试助手', '校园招聘', 'Windows、Android、Chrome 和 Edge']) {
  if (!llms.includes(term)) errors.push(`llms.txt: missing fact ${term}`);
}
if (/支持(?:Windows、)?macOS|支持 Mac|支持Windows、Mac/i.test(llms)) errors.push('llms.txt: Mac is incorrectly marked as supported');

if (errors.length) {
  process.stderr.write(`${errors.join('\n')}\n`);
  process.exit(1);
}

process.stdout.write(`SEO_VERIFY_OK pages=${requiredPages.length} titles=${titles.size} canonicals=${canonicals.size}\n`);
