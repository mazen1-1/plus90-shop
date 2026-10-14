const API_ROOT = 'https://api.github.com';

export function githubConfig(env) {
  const owner = String(env.GITHUB_OWNER || '').trim();
  const repo = String(env.GITHUB_REPO || '').trim();
  const branch = String(env.GITHUB_BRANCH || 'main').trim();
  if (!env.GITHUB_TOKEN) throw new Error('GitHub secret GITHUB_TOKEN is missing.');
  if (!owner || !repo || owner.startsWith('YOUR_') || repo.startsWith('YOUR_')) throw new Error('Set GITHUB_OWNER and GITHUB_REPO in wrangler.toml or Cloudflare variables first.');
  return { owner, repo, branch };
}

async function githubApiFetch(env, endpoint, options = {}) {
  const config = githubConfig(env);
  return fetch(`${API_ROOT}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/${endpoint}${options.query || ''}`, {
    method: options.method || 'GET',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'PLUS90-Shop-Admin',
      ...(options.body ? { 'Content-Type': 'application/json' } : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
}

const githubFetch = (env, path, options = {}) => githubApiFetch(env, `contents/${path}`, options);

function toBase64(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

function encodePath(path) { return path.split('/').map(encodeURIComponent).join('/'); }

export async function putGithubFile(env, path, contents, message) {
  const config = githubConfig(env);
  const encodedPath = encodePath(path);
  const existingResponse = await githubFetch(env, encodedPath, { query: `?ref=${encodeURIComponent(config.branch)}` });
  let sha;
  if (existingResponse.ok) {
    const existing = await existingResponse.json();
    sha = existing.sha;
  } else if (existingResponse.status !== 404) {
    const detail = await existingResponse.text();
    throw new Error(`Could not read ${path} from GitHub (${existingResponse.status}): ${detail.slice(0, 250)}`);
  }
  const response = await githubFetch(env, encodedPath, {
    method: 'PUT',
    body: { message, content: toBase64(contents), branch: config.branch, ...(sha ? { sha } : {}) }
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Could not save ${path} to GitHub (${response.status}): ${detail.slice(0, 300)}`);
  }
  return response.json();
}

export async function uploadProductImages(env, files) {
  const config = githubConfig(env);
  if (!Array.isArray(files) || !files.length) return [];
  const typeToExt = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' };
  const totalBytes = files.reduce((sum, file) => sum + Number(file.size || 0), 0);
  if (totalBytes > 8 * 1024 * 1024) throw new Error('الحجم الإجمالي للصور الجديدة يجب ألا يتجاوز 8 ميجابايت في المرة الواحدة.');
  const prepared = [];
  for (const file of files) {
    const extension = typeToExt[file.type];
    if (!extension) throw new Error('صيغة الصورة غير مدعومة. استخدم JPG أو PNG أو WebP أو AVIF.');
    if (file.size < 1 || file.size > 3 * 1024 * 1024) throw new Error('حجم كل صورة يجب ألا يتجاوز 3 ميجابايت.');
    const unique = crypto.randomUUID().replace(/-/g, '').slice(0, 14);
    const filename = `${Date.now()}-${unique}.${extension}`;
    prepared.push({ filename, path: `public/assets/products/${filename}`, bytes: new Uint8Array(await file.arrayBuffer()) });
  }

  // Create all image blobs, then commit them together so each product upload causes
  // one GitHub image commit instead of one Cloudflare build per image.
  const refPath = `git/ref/heads/${encodePath(config.branch)}`;
  const refResponse = await githubApiFetch(env, refPath);
  if (!refResponse.ok) throw new Error(`تعذر قراءة فرع GitHub (${refResponse.status}). تأكد من اسم الفرع والتوكن.`);
  const refData = await refResponse.json();
  const latestCommitSha = refData.object?.sha;
  if (!latestCommitSha) throw new Error('لم يتم العثور على آخر commit في فرع GitHub.');

  const commitResponse = await githubApiFetch(env, `git/commits/${encodeURIComponent(latestCommitSha)}`);
  if (!commitResponse.ok) throw new Error(`تعذر قراءة شجرة ملفات GitHub (${commitResponse.status}).`);
  const commitData = await commitResponse.json();
  const treeEntries = [];
  for (const item of prepared) {
    const blobResponse = await githubApiFetch(env, 'git/blobs', { method: 'POST', body: { content: toBase64(item.bytes), encoding: 'base64' } });
    if (!blobResponse.ok) throw new Error(`تعذر رفع الصورة ${item.filename} إلى GitHub (${blobResponse.status}).`);
    const blobData = await blobResponse.json();
    treeEntries.push({ path: item.path, mode: '100644', type: 'blob', sha: blobData.sha });
  }
  const treeResponse = await githubApiFetch(env, 'git/trees', { method: 'POST', body: { base_tree: commitData.tree?.sha, tree: treeEntries } });
  if (!treeResponse.ok) throw new Error(`تعذر تجهيز ملفات الصور في GitHub (${treeResponse.status}).`);
  const treeData = await treeResponse.json();
  const newCommitResponse = await githubApiFetch(env, 'git/commits', { method: 'POST', body: { message: `Add ${prepared.length} PLUS90 product image${prepared.length === 1 ? '' : 's'}`, tree: treeData.sha, parents: [latestCommitSha] } });
  if (!newCommitResponse.ok) throw new Error(`تعذر إنشاء commit للصور (${newCommitResponse.status}).`);
  const newCommit = await newCommitResponse.json();
  const updateRefResponse = await githubApiFetch(env, `git/refs/heads/${encodePath(config.branch)}`, { method: 'PATCH', body: { sha: newCommit.sha, force: false } });
  if (!updateRefResponse.ok) throw new Error(`تم تجهيز الصور لكن تعذر تحديث فرع GitHub (${updateRefResponse.status}). أعد المحاولة.`);

  return prepared.map(item => `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/${item.path}`);
}

export async function deleteRepoFiles(env, paths) {
  const config = githubConfig(env);
  const existing = [];
  for (const path of [...new Set(paths)]) {
    if (!path.startsWith('public/assets/products/') || path.includes('..')) continue;
    const check = await githubFetch(env, encodePath(path), { query: `?ref=${encodeURIComponent(config.branch)}` });
    if (check.ok) existing.push(path);
    else if (check.status !== 404) throw new Error(`تعذر التحقق من ملف الصورة في GitHub (${check.status}).`);
  }
  if (!existing.length) return 0;
  const refResponse = await githubApiFetch(env, `git/ref/heads/${encodePath(config.branch)}`);
  if (!refResponse.ok) throw new Error(`تعذر قراءة فرع GitHub (${refResponse.status}).`);
  const latestCommitSha = (await refResponse.json()).object?.sha;
  if (!latestCommitSha) throw new Error('لم يتم العثور على آخر commit في فرع GitHub.');
  const commitResponse = await githubApiFetch(env, `git/commits/${encodeURIComponent(latestCommitSha)}`);
  if (!commitResponse.ok) throw new Error(`تعذر قراءة شجرة ملفات GitHub (${commitResponse.status}).`);
  const commitData = await commitResponse.json();
  const treeResponse = await githubApiFetch(env, 'git/trees', { method: 'POST', body: { base_tree: commitData.tree?.sha, tree: existing.map(path => ({ path, mode: '100644', type: 'blob', sha: null })) } });
  if (!treeResponse.ok) throw new Error(`تعذر تجهيز حذف الصور في GitHub (${treeResponse.status}).`);
  const treeData = await treeResponse.json();
  const newCommitResponse = await githubApiFetch(env, 'git/commits', { method: 'POST', body: { message: `Delete ${existing.length} PLUS90 product image${existing.length === 1 ? '' : 's'}`, tree: treeData.sha, parents: [latestCommitSha] } });
  if (!newCommitResponse.ok) throw new Error(`تعذر إنشاء commit لحذف الصور (${newCommitResponse.status}).`);
  const newCommit = await newCommitResponse.json();
  const updateRefResponse = await githubApiFetch(env, `git/refs/heads/${encodePath(config.branch)}`, { method: 'PATCH', body: { sha: newCommit.sha, force: false } });
  if (!updateRefResponse.ok) throw new Error(`تعذر تحديث فرع GitHub بعد حذف الصور (${updateRefResponse.status}).`);
  return existing.length;
}

// Deletes image files from GitHub, skipping any file still used by another product.
export async function deleteUnusedProductImages(env, db, imageUrls) {
  const candidates = (imageUrls || []).filter(Boolean);
  if (!candidates.length || !verifyRepoImageUrls(env, candidates)) return 0;
  const { results = [] } = await db.prepare('SELECT images_json FROM products').all();
  const inUse = new Set(results.flatMap(row => parseArray(row.images_json)));
  const { owner, repo, branch } = githubConfig(env);
  const prefix = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/`;
  const paths = candidates.filter(url => !inUse.has(url)).map(url => url.slice(prefix.length));
  return paths.length ? deleteRepoFiles(env, paths) : 0;
}

export function verifyRepoImageUrls(env, urls) {
  const { owner, repo, branch } = githubConfig(env);
  const prefix = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/public/assets/products/`;
  return urls.every(url => typeof url === 'string' && url.startsWith(prefix) && !url.includes('..'));
}

export async function syncProductsJson(env, db) {
  const { results = [] } = await db.prepare('SELECT id, code, title, description, price, images_json, sizes_json, created_at, updated_at FROM products ORDER BY created_at DESC').all();
  const catalog = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    products: results.map(row => ({
      id: row.id, code: row.code, title: row.title, description: row.description,
      price: Number(row.price), images: parseArray(row.images_json), sizes: parseArray(row.sizes_json),
      createdAt: row.created_at, updatedAt: row.updated_at
    }))
  };
  await putGithubFile(env, 'public/data/products.json', JSON.stringify(catalog, null, 2) + '\n', 'Sync PLUS90 product catalog');
  return catalog.products.length;
}

function parseArray(value) { try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
