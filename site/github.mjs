// GitHub Contents API write flows. The token never leaves this module except as
// an Authorization header — it is never logged, rendered, or put in a URL.

const KEY = 'cookbook.settings';

export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { token: '', owner: '', repo: '', branch: 'main', ...s };
  } catch {
    return { token: '', owner: '', repo: '', branch: 'main' };
  }
}

export function saveSettings(s) {
  localStorage.setItem(KEY, JSON.stringify({ ...loadSettings(), ...s }));
}

export function canWrite() {
  const s = loadSettings();
  return !!(s.token && s.owner && s.repo);
}

export class ApiError extends Error {
  constructor(message, kind) { super(message); this.kind = kind; }
}

const b64encode = (text) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(text)));
const b64decode = (b64) =>
  new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, '')), (c) => c.charCodeAt(0)));

async function api(path, init = {}) {
  const s = loadSettings();
  const url = `https://api.github.com/repos/${s.owner}/${s.repo}/contents/${path}`;
  let res;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${s.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch {
    throw new ApiError('Network error — nothing was saved', 'network');
  }
  if (res.status === 401 || res.status === 403) throw new ApiError('Token invalid or lacks access', 'auth');
  if (res.status === 409 || res.status === 422) throw new ApiError('File changed since it was read', 'conflict');
  if (!res.ok) throw new ApiError(`GitHub returned ${res.status}`, 'http');
  return res.json();
}

async function getFile(path) {
  const s = loadSettings();
  const data = await api(`${path}?ref=${encodeURIComponent(s.branch)}`);
  return { text: b64decode(data.content), sha: data.sha };
}

async function putFile(path, text, sha, message) {
  const s = loadSettings();
  return api(path, {
    method: 'PUT',
    body: JSON.stringify({ message, content: b64encode(text), sha, branch: s.branch }),
  });
}

/**
 * Read → transform → write a single file. Retries once on a sha conflict.
 * @param {string} path
 * @param {(text: string) => string} transform
 * @param {string} message commit message
 */
export async function editFile(path, transform, message) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { text, sha } = await getFile(path);
    const next = transform(text);
    if (next === text) return text;
    try {
      await putFile(path, next, sha, message);
      return next;
    } catch (e) {
      if (e.kind === 'conflict' && attempt === 0) continue;
      throw e;
    }
  }
  throw new ApiError('File kept changing — try again', 'conflict');
}
