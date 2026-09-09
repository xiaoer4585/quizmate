const fs = require('fs');
const { execFileSync } = require('child_process');

const owner = 'xiaoer4585';
const repo = 'quizmate';
const commit = '35ca6aa';
const token = process.env.GH_TOKEN;
if (!token) throw new Error('GH_TOKEN is required');

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

async function api(path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${path}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  const base = (await api(`/repos/${owner}/${repo}/git/commits/b5966f2f797b029ea57534db50f1a714584289da`));
  const files = git('diff-tree', '--no-commit-id', '--name-only', '-r', commit).split(/\r?\n/).filter(Boolean);
  const tree = [];
  for (const file of files) {
    const content = execFileSync('git', ['cat-file', 'blob', `${commit}:${file}`]);
    const blob = await api(`/repos/${owner}/${repo}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ content: content.toString('base64'), encoding: 'base64' }),
    });
    tree.push({ path: file, mode: '100644', type: 'blob', sha: blob.sha });
  }
  const newTree = await api(`/repos/${owner}/${repo}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ base_tree: base.tree.sha, tree }),
  });
  const message = execFileSync('git', ['show', '-s', '--format=%B', commit], { encoding: 'utf8' });
  const authorName = git('show', '-s', '--format=%an', commit);
  const authorEmail = git('show', '-s', '--format=%ae', commit);
  const authorDate = git('show', '-s', '--format=%aI', commit);
  const committerName = git('show', '-s', '--format=%cn', commit);
  const committerEmail = git('show', '-s', '--format=%ce', commit);
  const committerDate = git('show', '-s', '--format=%cI', commit);
  const created = await api(`/repos/${owner}/${repo}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message,
      tree: newTree.sha,
      parents: [base.sha],
      author: { name: authorName, email: authorEmail, date: authorDate },
      committer: { name: committerName, email: committerEmail, date: committerDate },
    }),
  });
  if (created.sha !== git('rev-parse', commit)) throw new Error(`commit mismatch local=${git('rev-parse', commit)} remote=${created.sha}`);
  await api(`/repos/${owner}/${repo}/git/refs/heads/main`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: created.sha, force: false }),
  });
  console.log(`GITHUB_MAIN_UPDATED ${created.sha}`);
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
