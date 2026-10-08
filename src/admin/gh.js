/* Client minimal de l'API GitHub (Contents + Actions), sans dépendance. */

const API = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/* --- encodage UTF-8 <-> base64 --- */
export function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}
export function base64ToUtf8(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function createClient({ token, repo, branch = 'main' }) {
  if (!token || !repo) throw new Error('Jeton et dépôt requis');

  async function request(method, path, body) {
    let res;
    try {
      res = await fetch(`${API}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new GitHubError('Pas de connexion à GitHub. Vérifie ton réseau.', 0);
    }
    const expires = res.headers.get('github-authentication-token-expiration');
    if (expires) client.tokenExpiration = expires;

    if (res.status === 204) return null;
    let data = null;
    const text = await res.text();
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }

    if (!res.ok) {
      const msg = {
        401: 'Jeton refusé. Il est peut-être expiré ou mal copié.',
        403: 'Accès refusé. Vérifie les permissions du jeton (Contents : lecture/écriture).',
        404: 'Introuvable. Vérifie le nom du dépôt et la branche.',
        409: 'Conflit : le fichier a changé entre-temps.',
        422: data?.message || 'Requête invalide.',
      }[res.status] || `Erreur GitHub ${res.status}`;
      throw new GitHubError(msg, res.status, data);
    }
    return data;
  }

  const client = {
    repo,
    branch,
    tokenExpiration: null,

    /** Vérifie le jeton et l'accès au dépôt. */
    async check() {
      const info = await request('GET', `/repos/${repo}`);
      return { fullName: info.full_name, defaultBranch: info.default_branch, private: info.private, htmlUrl: info.html_url };
    },

    /** Lit un fichier texte : { text, sha } (null si absent). */
    async getFile(path) {
      try {
        const data = await request('GET', `/repos/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`);
        return { text: base64ToUtf8(data.content), sha: data.sha };
      } catch (err) {
        if (err.status === 404) return null;
        throw err;
      }
    },

    /** Lit un fichier JSON : { data, sha }. */
    async getJson(path) {
      const file = await client.getFile(path);
      if (!file) throw new GitHubError(`Fichier ${path} introuvable dans le dépôt.`, 404);
      return { data: JSON.parse(file.text), sha: file.sha };
    },

    /** Écrit un fichier texte (création ou mise à jour). Retourne le nouveau sha. */
    async putFile(path, text, message, sha) {
      const data = await request('PUT', `/repos/${repo}/contents/${encodePath(path)}`, {
        message, content: utf8ToBase64(text), branch, ...(sha ? { sha } : {}),
      });
      return data.content.sha;
    },

    /** Écrit un fichier binaire déjà encodé en base64. */
    async putBinary(path, base64, message) {
      const existing = await client.getSha(path);
      const data = await request('PUT', `/repos/${repo}/contents/${encodePath(path)}`, {
        message, content: base64, branch, ...(existing ? { sha: existing } : {}),
      });
      return data.content.sha;
    },

    /** Lit un fichier binaire en data URL (images < 1 Mo). */
    async getDataUrl(path) {
      const data = await request('GET', `/repos/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`);
      const ext = path.split('.').pop().toLowerCase();
      const mime = { webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif' }[ext] || 'application/octet-stream';
      return `data:${mime};base64,${String(data.content).replace(/\s/g, '')}`;
    },

    async getSha(path) {
      try {
        const data = await request('GET', `/repos/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`);
        return data.sha;
      } catch (err) {
        if (err.status === 404) return null;
        throw err;
      }
    },

    /** Modifie un JSON de façon sûre : relit la dernière version, applique `mutate`, écrit. */
    async updateJson(path, mutate, message) {
      let lastErr = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data, sha } = await client.getJson(path);
        const next = (await mutate(structuredClone(data))) || data;
        const text = JSON.stringify(next, null, 2) + '\n';
        try {
          const newSha = await client.putFile(path, text, message, sha);
          return { data: next, sha: newSha };
        } catch (err) {
          lastErr = err;
          if (err.status !== 409 && err.status !== 422) throw err;
          await new Promise((r) => setTimeout(r, 600));
        }
      }
      throw lastErr;
    },

    /** Dernière exécution du workflow sur la branche (null si non accessible). */
    async latestRun() {
      try {
        const data = await request('GET', `/repos/${repo}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=1`);
        const run = data.workflow_runs?.[0];
        if (!run) return null;
        return { id: run.id, status: run.status, conclusion: run.conclusion, url: run.html_url, createdAt: run.created_at, updatedAt: run.updated_at, sha: run.head_sha };
      } catch (err) {
        if (err.status === 403 || err.status === 404) return { unavailable: true };
        throw err;
      }
    },

    /** Dernier commit touchant le contenu. */
    async latestContentCommit() {
      try {
        const data = await request('GET', `/repos/${repo}/commits?sha=${encodeURIComponent(branch)}&path=content&per_page=1`);
        const c = data?.[0];
        return c ? { sha: c.sha, date: c.commit?.committer?.date || c.commit?.author?.date, message: c.commit?.message } : null;
      } catch {
        return null;
      }
    },
  };
  return client;
}

function encodePath(p) {
  return String(p).split('/').map(encodeURIComponent).join('/');
}
