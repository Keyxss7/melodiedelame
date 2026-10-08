/* Admin Mélodie de l’Âme — application mobile sans serveur.
   Lit et écrit directement content/*.json dans le dépôt GitHub via l'API. */
import { createClient } from './gh.js';
import { compressImage, formatBytes } from './img.js';

const CFG = Object.assign({
  repo: '', branch: 'main', contentDir: 'content', uploadsDir: 'src/images/uploads',
  sitePublicPrefix: 'images/uploads', siteUrl: '',
}, window.MDA_CONFIG || {});

const SESSION_KEY = 'mda.session';
const DRAFT_PREFIX = 'mda.draft.';
const $app = document.getElementById('app');
const $toasts = document.getElementById('toasts');

const state = {
  session: null,     // { token, repo, branch, expires }
  client: null,
  cache: {},         // { prestations: {data, sha}, ... }
  publish: null,     // { phase: 'pending'|'running'|'done'|'failed'|'unknown', url, at }
  pollTimer: null,
  lastCommit: null,
};

const KINDS = {
  prestations: { label: 'Prestations', singular: 'prestation', article: 'une', file: 'prestations.json' },
  formations: { label: 'Initiations', singular: 'initiation', article: 'une', file: 'formations.json' },
};

/* =====================================================================
   Utilitaires
   ===================================================================== */
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function slugify(text) {
  return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'element';
}

function toast(message, type = 'info', ms = 3200) {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  $toasts.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-in'));
  setTimeout(() => { el.classList.remove('is-in'); setTimeout(() => el.remove(), 250); }, ms);
}

function confirmDialog(message, { ok = 'Confirmer', danger = false } = {}) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <p>${esc(message)}</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" data-cancel>Annuler</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(ok)}</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const done = (v) => { wrap.remove(); resolve(v); };
    wrap.querySelector('[data-cancel]').onclick = () => done(false);
    wrap.querySelector('[data-ok]').onclick = () => done(true);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) done(false); });
    wrap.querySelector('[data-ok]').focus();
  });
}

function relativeTime(iso) {
  if (!iso) return '';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'à l’instant';
  if (diff < 3600) return `il y a ${Math.round(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.round(diff / 3600)} h`;
  if (diff < 86400 * 30) return `il y a ${Math.round(diff / 86400)} j`;
  return new Date(iso).toLocaleDateString('fr-FR');
}

function daysUntil(iso) {
  if (!iso) return null;
  return Math.round((new Date(iso).getTime() - Date.now()) / 86400000);
}

function imageUrl(path) {
  if (!path) return '';
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  return `${CFG.siteUrl.replace(/\/$/, '')}/${path}`;
}

/* Image avec repli : si la photo n'est pas encore en ligne, on la lit via l'API. */
function imgTag(path, cls = '') {
  if (!path) return `<div class="ph ${cls}" aria-hidden="true"></div>`;
  return `<img class="${cls}" src="${esc(imageUrl(path))}" alt="" loading="lazy" data-repo-path="${esc(path)}">`;
}
document.addEventListener('error', async (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.dataset.repoPath || img.dataset.fallback) return;
  img.dataset.fallback = '1';
  try {
    const repoPath = `src/${img.dataset.repoPath}`;
    img.src = await state.client.getDataUrl(repoPath);
  } catch { img.replaceWith(Object.assign(document.createElement('div'), { className: `ph ${img.className}` })); }
}, true);

/* Session */
function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}
function saveSession(s) { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
function clearSession() { localStorage.removeItem(SESSION_KEY); }

/* Brouillons */
const draftKey = (k) => DRAFT_PREFIX + k;
function getDraft(k) { try { return JSON.parse(localStorage.getItem(draftKey(k)) || 'null'); } catch { return null; } }
function setDraft(k, v) { try { localStorage.setItem(draftKey(k), JSON.stringify(v)); } catch { /* quota */ } }
function clearDraft(k) { localStorage.removeItem(draftKey(k)); }

/* Données */
async function load(kind, { force = false } = {}) {
  const file = { prestations: 'prestations.json', formations: 'formations.json', accueil: 'accueil.json', site: 'site.json' }[kind];
  if (!force && state.cache[kind]) return state.cache[kind].data;
  const res = await state.client.getJson(`${CFG.contentDir}/${file}`);
  state.cache[kind] = res;
  return res.data;
}

async function update(kind, mutate, message) {
  const file = { prestations: 'prestations.json', formations: 'formations.json', accueil: 'accueil.json', site: 'site.json' }[kind];
  const res = await state.client.updateJson(`${CFG.contentDir}/${file}`, mutate, message);
  state.cache[kind] = res;
  publishStarted();
  return res.data;
}

/* =====================================================================
   Statut de publication (GitHub Actions)
   ===================================================================== */
function publishStarted() {
  state.publish = { phase: 'pending', at: new Date().toISOString() };
  renderStatusBar();
  startPolling();
}

function startPolling() {
  clearInterval(state.pollTimer);
  const startedAt = Date.now();
  const tick = async () => {
    if (!state.client) return clearInterval(state.pollTimer);
    const run = await state.client.latestRun().catch(() => null);
    if (!run || run.unavailable) {
      state.publish = { phase: 'unknown', at: state.publish?.at };
      renderStatusBar();
      return clearInterval(state.pollTimer);
    }
    const runStarted = new Date(run.createdAt).getTime();
    const isOurs = state.publish?.at ? runStarted >= new Date(state.publish.at).getTime() - 15000 : true;
    if (!isOurs) {
      if (Date.now() - startedAt > 4 * 60 * 1000) { state.publish = { phase: 'unknown' }; renderStatusBar(); clearInterval(state.pollTimer); }
      return;
    }
    if (run.status === 'completed') {
      state.publish = { phase: run.conclusion === 'success' ? 'done' : 'failed', url: run.url, at: run.updatedAt };
      renderStatusBar();
      clearInterval(state.pollTimer);
      if (run.conclusion === 'success') toast('Le site est à jour ✓', 'success');
      else toast('La publication a échoué. Ouvre le détail pour voir l’erreur.', 'error', 6000);
    } else {
      state.publish = { phase: 'running', url: run.url, at: state.publish?.at || run.createdAt };
      renderStatusBar();
    }
  };
  tick();
  state.pollTimer = setInterval(tick, 8000);
}

async function refreshStatus() {
  if (!state.client) return;
  const [run, commit] = await Promise.all([state.client.latestRun().catch(() => null), state.client.latestContentCommit().catch(() => null)]);
  state.lastCommit = commit;
  if (!run || run.unavailable) state.publish = { phase: 'unknown' };
  else if (run.status !== 'completed') { state.publish = { phase: 'running', url: run.url, at: run.createdAt }; startPolling(); }
  else state.publish = { phase: run.conclusion === 'success' ? 'done' : 'failed', url: run.url, at: run.updatedAt };
  renderStatusBar();
}

function statusBarHtml() {
  const p = state.publish;
  if (!p) return '';
  const map = {
    pending: ['⏳', 'Publication en cours…', 'is-busy'],
    running: ['⏳', 'Publication en cours… (environ 1 min)', 'is-busy'],
    done: ['✓', `Site en ligne et à jour — ${relativeTime(p.at)}`, 'is-ok'],
    failed: ['✕', 'La dernière publication a échoué', 'is-error'],
    unknown: ['•', state.lastCommit ? `Dernière modification ${relativeTime(state.lastCommit.date)}` : 'Statut de publication indisponible', 'is-muted'],
  };
  const [icon, text, cls] = map[p.phase] || map.unknown;
  const link = p.url && (p.phase === 'failed' || p.phase === 'running') ? ` <a href="${esc(p.url)}" target="_blank" rel="noopener">détail</a>` : '';
  return `<div class="statusbar ${cls}"><span class="statusbar-icon">${icon}</span><span>${text}${link}</span></div>`;
}
function renderStatusBar() {
  const el = document.querySelector('[data-statusbar]');
  if (el) el.innerHTML = statusBarHtml();
}

/* =====================================================================
   Composants de formulaire
   ===================================================================== */
function field(label, name, value = '', { type = 'text', placeholder = '', hint = '', required = false, rows = 0 } = {}) {
  const id = `f-${name.replace(/[^a-z0-9]/gi, '-')}`;
  const input = rows
    ? `<textarea id="${id}" name="${esc(name)}" rows="${rows}" placeholder="${esc(placeholder)}"${required ? ' required' : ''}>${esc(value)}</textarea>`
    : `<input id="${id}" type="${type}" name="${esc(name)}" value="${esc(value)}" placeholder="${esc(placeholder)}"${required ? ' required' : ''}${type === 'url' ? ' inputmode="url"' : ''}>`;
  return `<div class="field"><label for="${id}">${esc(label)}${required ? ' <span class="req">*</span>' : ''}</label>${input}${hint ? `<p class="hint">${esc(hint)}</p>` : ''}</div>`;
}

function toggleField(label, name, checked, hint = '') {
  return `<div class="field field-toggle">
    <label class="toggle"><input type="checkbox" name="${esc(name)}"${checked ? ' checked' : ''}><span class="toggle-track"></span><span>${esc(label)}</span></label>
    ${hint ? `<p class="hint">${esc(hint)}</p>` : ''}
  </div>`;
}

/* Liste d'étiquettes (bénéfices, puces, badges) */
function chipsField(label, name, values = [], placeholder = 'Ajouter…') {
  return `<div class="field" data-chips="${esc(name)}">
    <label>${esc(label)}</label>
    <ul class="chips-edit" role="list">${(values || []).map((v) => chipHtml(v)).join('')}</ul>
    <div class="chips-add"><input type="text" placeholder="${esc(placeholder)}" aria-label="${esc(label)} — nouvel élément" enterkeyhint="done"><button type="button" class="btn btn-small btn-secondary" data-add-chip>Ajouter</button></div>
  </div>`;
}
function chipHtml(v) {
  return `<li class="chip-edit"><span class="chip-value">${esc(v)}</span><button type="button" class="chip-remove" aria-label="Retirer ${esc(v)}">×</button></li>`;
}
function readChips(form, name) {
  const box = form.querySelector(`[data-chips="${CSS.escape(name)}"]`);
  if (!box) return [];
  return [...box.querySelectorAll('.chip-value')].map((el) => el.textContent.trim()).filter(Boolean);
}
function bindChips(form) {
  form.querySelectorAll('[data-chips]').forEach((box) => {
    const input = box.querySelector('.chips-add input');
    const add = () => {
      const v = input.value.trim();
      if (!v) return;
      box.querySelector('.chips-edit').insertAdjacentHTML('beforeend', chipHtml(v));
      input.value = '';
      form.dispatchEvent(new Event('input', { bubbles: true }));
    };
    box.querySelector('[data-add-chip]').addEventListener('click', add);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    box.addEventListener('click', (e) => {
      if (e.target.classList.contains('chip-remove')) { e.target.closest('li').remove(); form.dispatchEvent(new Event('input', { bubbles: true })); }
    });
  });
}

/* Photo */
function photoField(label, current, { hint = 'Depuis la galerie ou l’appareil photo. Redimensionnée et compressée automatiquement.' } = {}) {
  return `<div class="field" data-photo>
    <label>${esc(label)}</label>
    <div class="photo-box">
      <div class="photo-preview">${imgTag(current, 'photo-img')}</div>
      <div class="photo-actions">
        <label class="btn btn-secondary btn-small">Choisir une photo<input type="file" accept="image/*" hidden data-photo-input></label>
        <button type="button" class="btn btn-ghost btn-small" data-photo-remove${current ? '' : ' hidden'}>Retirer</button>
      </div>
    </div>
    <p class="hint" data-photo-hint>${esc(hint)}</p>
  </div>`;
}
function bindPhoto(form, pending) {
  const box = form.querySelector('[data-photo]');
  if (!box) return;
  const input = box.querySelector('[data-photo-input]');
  const removeBtn = box.querySelector('[data-photo-remove]');
  const preview = box.querySelector('.photo-preview');
  const hint = box.querySelector('[data-photo-hint]');
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    hint.textContent = 'Compression en cours…';
    try {
      const out = await compressImage(file);
      pending.photo = out;
      pending.removePhoto = false;
      preview.innerHTML = `<img class="photo-img" src="${out.previewUrl}" alt="">`;
      removeBtn.hidden = false;
      hint.textContent = `Prête : ${out.width}×${out.height}, ${formatBytes(out.blob.size)} (envoyée à l’enregistrement).`;
    } catch (err) {
      hint.textContent = err.message;
      toast(err.message, 'error');
    }
    input.value = '';
  });
  removeBtn.addEventListener('click', () => {
    pending.photo = null;
    pending.removePhoto = true;
    preview.innerHTML = imgTag('', 'photo-img');
    removeBtn.hidden = true;
    hint.textContent = 'Photo retirée (effectif à l’enregistrement).';
  });
}

/* Blocs d'initiation (titre + liste de points) */
function blocsField(blocs = []) {
  return `<div class="field" data-blocs>
    <label>Contenu de l’initiation</label>
    <p class="hint">Chaque bloc a un titre (ex. « Cette initiation vous permet ») et une liste de points, un par ligne.</p>
    <div class="blocs">${blocs.map((b, i) => blocHtml(b, i)).join('')}</div>
    <button type="button" class="btn btn-secondary btn-small" data-add-bloc>Ajouter un bloc</button>
  </div>`;
}
function blocHtml(b = { titre: '', points: [] }, i = 0) {
  return `<div class="bloc">
    <div class="bloc-head"><input type="text" placeholder="Titre du bloc" value="${esc(b.titre)}" data-bloc-titre aria-label="Titre du bloc ${i + 1}"><button type="button" class="chip-remove" data-remove-bloc aria-label="Retirer ce bloc">×</button></div>
    <textarea rows="4" placeholder="Un point par ligne" data-bloc-points aria-label="Points du bloc ${i + 1}">${esc((b.points || []).join('\n'))}</textarea>
  </div>`;
}
function readBlocs(form) {
  return [...form.querySelectorAll('.bloc')].map((el) => ({
    titre: el.querySelector('[data-bloc-titre]').value.trim(),
    points: el.querySelector('[data-bloc-points]').value.split('\n').map((s) => s.trim()).filter(Boolean),
  })).filter((b) => b.points.length); // un bloc sans point n'est pas publié
}
function bindBlocs(form) {
  const box = form.querySelector('[data-blocs]');
  if (!box) return;
  box.querySelector('[data-add-bloc]').addEventListener('click', () => {
    box.querySelector('.blocs').insertAdjacentHTML('beforeend', blocHtml({ titre: '', points: [] }, box.querySelectorAll('.bloc').length));
    form.dispatchEvent(new Event('input', { bubbles: true }));
  });
  box.addEventListener('click', (e) => {
    if (e.target.matches('[data-remove-bloc]')) { e.target.closest('.bloc').remove(); form.dispatchEvent(new Event('input', { bubbles: true })); }
  });
}

/* Lecture générique d'un formulaire */
function readForm(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name || el.closest('[data-chips]') || el.closest('[data-blocs]') || el.closest('[data-photo]')) continue;
    out[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  }
  return out;
}
function paragraphsFromText(t) { return String(t || '').split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean); }

/* Brouillons automatiques */
function bindDraft(form, key, pending) {
  let timer;
  form.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => setDraft(key, { form: readForm(form), chips: chipsSnapshot(form), blocs: readBlocs(form), at: Date.now() }), 400);
  });
  pending.draftKey = key;
}
function chipsSnapshot(form) {
  const out = {};
  form.querySelectorAll('[data-chips]').forEach((box) => { out[box.dataset.chips] = readChips(form, box.dataset.chips); });
  return out;
}
function applyDraft(form, draft) {
  for (const [name, v] of Object.entries(draft.form || {})) {
    const el = form.elements[name];
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
  }
  for (const [name, values] of Object.entries(draft.chips || {})) {
    const list = form.querySelector(`[data-chips="${CSS.escape(name)}"] .chips-edit`);
    if (list) list.innerHTML = values.map(chipHtml).join('');
  }
  if (draft.blocs && form.querySelector('.blocs')) {
    form.querySelector('.blocs').innerHTML = draft.blocs.map((b, i) => blocHtml(b, i)).join('');
  }
}
function draftBanner(key) {
  const d = getDraft(key);
  if (!d) return '';
  return `<div class="banner" data-draft-banner>
    <span>Un brouillon non enregistré existe (${relativeTime(new Date(d.at).toISOString())}).</span>
    <span class="banner-actions"><button type="button" class="btn btn-small btn-primary" data-draft-apply>Reprendre</button><button type="button" class="btn btn-small btn-ghost" data-draft-discard>Ignorer</button></span>
  </div>`;
}
function bindDraftBanner(form, key) {
  const banner = document.querySelector('[data-draft-banner]');
  if (!banner) return;
  banner.querySelector('[data-draft-apply]').onclick = () => { applyDraft(form, getDraft(key)); banner.remove(); };
  banner.querySelector('[data-draft-discard]').onclick = () => { clearDraft(key); banner.remove(); };
}

/* Bouton avec état « en cours » */
async function withBusy(btn, label, fn) {
  const old = btn.textContent;
  btn.disabled = true; btn.textContent = label;
  try { return await fn(); } finally { btn.disabled = false; btn.textContent = old; }
}

/* =====================================================================
   Écrans
   ===================================================================== */
function shell({ title, back = '', actions = '', body, statusbar = true }) {
  return `
<div class="screen">
  <header class="appbar">
    ${back ? `<a class="appbar-back" href="${esc(back)}" aria-label="Retour">‹</a>` : `<img class="appbar-logo" src="../images/logo2.webp" alt="">`}
    <h1 class="appbar-title">${esc(title)}</h1>
    <div class="appbar-actions">${actions}</div>
  </header>
  ${statusbar ? `<div data-statusbar>${statusBarHtml()}</div>` : ''}
  <div class="content">${body}</div>
</div>`;
}

/* --- Connexion --- */
function screenLogin(error = '') {
  const s = loadSession() || {};
  $app.innerHTML = `
<div class="screen screen-login">
  <div class="login-card">
    <img class="login-logo" src="../images/logo2.webp" alt="">
    <h1>Admin du site</h1>
    <p class="login-sub">Ajoute et modifie les prestations, initiations et textes. Rien n’est publié sans ton jeton.</p>
    ${error ? `<div class="banner banner-error">${esc(error)}</div>` : ''}
    <form id="login" autocomplete="off">
      ${field('Dépôt GitHub', 'repo', s.repo || CFG.repo, { placeholder: 'utilisateur/nom-du-depot', required: true, hint: 'Tel qu’il apparaît dans l’adresse github.com/…' })}
      ${field('Branche', 'branch', s.branch || CFG.branch || 'main', { required: true })}
      ${field('Jeton d’accès (token)', 'token', '', { type: 'password', required: true, placeholder: 'github_pat_…', hint: 'Fine-grained token, permissions : Contents (lecture/écriture) et Actions (lecture).' })}
      ${field('Date d’expiration du jeton (facultatif)', 'expires', s.expires ? s.expires.slice(0, 10) : '', { type: 'date', hint: 'Pour être prévenu avant qu’il n’expire.' })}
      <button type="submit" class="btn btn-primary btn-block">Se connecter</button>
    </form>
    <details class="help">
      <summary>Comment créer le jeton ? (2 min)</summary>
      <ol>
        <li>Sur GitHub (ordinateur ou téléphone) : <strong>Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token</strong>.</li>
        <li>Nom : « Admin site », expiration : 1 an (le maximum).</li>
        <li><strong>Repository access</strong> : « Only select repositories » → choisis le dépôt du site.</li>
        <li><strong>Permissions → Repository permissions</strong> : <em>Contents</em> : Read and write · <em>Actions</em> : Read-only. Rien d’autre.</li>
        <li>Génère, copie le jeton (il commence par <code>github_pat_</code>) et colle-le ci-dessus. Il ne sera stocké que sur ce téléphone.</li>
      </ol>
    </details>
  </div>
</div>`;
  document.getElementById('login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = readForm(e.target);
    const btn = e.target.querySelector('button[type=submit]');
    await withBusy(btn, 'Vérification…', async () => {
      try {
        const client = createClient({ token: f.token.trim(), repo: f.repo.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, ''), branch: f.branch.trim() || 'main' });
        await client.check();
        await client.getJson(`${CFG.contentDir}/site.json`);
        const expires = f.expires ? new Date(f.expires).toISOString() : client.tokenExpiration ? new Date(client.tokenExpiration).toISOString() : '';
        const session = { token: client ? f.token.trim() : '', repo: client.repo, branch: client.branch, expires };
        saveSession(session);
        state.session = session; state.client = client; state.cache = {};
        toast('Connecté ✓', 'success');
        location.hash = '#/';
        route();
      } catch (err) {
        screenLogin(err.message);
      }
    });
  });
}

/* --- Accueil admin --- */
async function screenHome() {
  const s = state.session;
  const days = daysUntil(s.expires);
  let warn = '';
  if (days !== null && days <= 14) {
    warn = `<div class="banner ${days <= 3 ? 'banner-error' : 'banner-warn'}">Ton jeton ${days < 0 ? 'a expiré' : `expire dans ${days} jour${days > 1 ? 's' : ''}`}. Crée-en un nouveau sur GitHub puis reconnecte-toi.</div>`;
  }
  $app.innerHTML = shell({
    title: 'Mélodie de l’Âme',
    actions: `<a class="btn btn-ghost btn-small" href="${esc(CFG.siteUrl || '/')}" target="_blank" rel="noopener">Voir le site</a>`,
    body: `
      ${warn}
      <nav class="tiles" aria-label="Sections">
        <a class="tile" href="#/prestations"><span class="tile-icon">✦</span><span class="tile-title">Prestations</span><span class="tile-sub" data-count="prestations">…</span></a>
        <a class="tile" href="#/formations"><span class="tile-icon">✧</span><span class="tile-title">Initiations</span><span class="tile-sub" data-count="formations">…</span></a>
        <a class="tile" href="#/accueil"><span class="tile-icon">❋</span><span class="tile-title">Page d’accueil</span><span class="tile-sub">Héro, présentation, parcours, sonothérapie, contact</span></a>
        <a class="tile" href="#/reglages"><span class="tile-icon">⚙</span><span class="tile-title">Réglages du site</span><span class="tile-sub">E-mail, téléphone, lien de réservation, zone</span></a>
      </nav>
      <p class="meta">Dépôt : <code>${esc(s.repo)}</code> · branche <code>${esc(s.branch)}</code>${s.expires ? ` · jeton valable jusqu’au ${new Date(s.expires).toLocaleDateString('fr-FR')}` : ''}</p>
      <button type="button" class="btn btn-ghost btn-small" data-logout>Se déconnecter de ce téléphone</button>
    `,
  });
  document.querySelector('[data-logout]').onclick = async () => {
    if (await confirmDialog('Effacer le jeton de ce téléphone ? Tu devras le coller à nouveau pour te reconnecter.', { ok: 'Se déconnecter', danger: true })) {
      clearSession(); state.client = null; state.session = null; state.cache = {};
      clearInterval(state.pollTimer);
      screenLogin();
    }
  };
  refreshStatus();
  for (const kind of ['prestations', 'formations']) {
    load(kind).then((d) => {
      const n = d.items.length, hidden = d.items.filter((i) => i.visible === false).length;
      const el = document.querySelector(`[data-count="${kind}"]`);
      if (el) el.textContent = `${n} ${KINDS[kind].singular}${n > 1 ? 's' : ''}${hidden ? ` · ${hidden} masquée${hidden > 1 ? 's' : ''}` : ''}`;
    }).catch((err) => toast(err.message, 'error'));
  }
}

/* --- Liste (prestations / initiations) --- */
async function screenList(kind) {
  const K = KINDS[kind];
  $app.innerHTML = shell({ title: K.label, back: '#/', body: '<p class="meta">Chargement…</p>' });
  let data;
  try { data = await load(kind, { force: true }); } catch (err) { return fail(err); }

  const items = data.items;
  const rows = items.map((it, i) => `
    <li class="row" data-id="${esc(it.id)}">
      <a class="row-main" href="#/${kind}/${encodeURIComponent(it.id)}">
        ${imgTag(it.image, 'row-thumb')}
        <span class="row-text"><span class="row-title">${esc(it.titre)}</span><span class="row-sub">${esc(it.sousTitre || '')}</span>${it.visible === false ? '<span class="tag">Masquée</span>' : ''}</span>
      </a>
      <span class="row-order">
        <button type="button" class="order-btn" data-move="up" aria-label="Monter"${i === 0 ? ' disabled' : ''}>▲</button>
        <button type="button" class="order-btn" data-move="down" aria-label="Descendre"${i === items.length - 1 ? ' disabled' : ''}>▼</button>
      </span>
    </li>`).join('');

  $app.innerHTML = shell({
    title: K.label, back: '#/',
    actions: `<a class="btn btn-ghost btn-small" href="#/${kind}/textes">Textes de la page</a>`,
    body: `
      <a class="btn btn-primary btn-block" href="#/${kind}/nouveau">+ Ajouter ${K.article} ${K.singular}</a>
      <ul class="rows" role="list" data-rows>${rows || `<li class="meta">Aucune ${K.singular} pour l’instant.</li>`}</ul>
      <div class="order-save" data-order-save hidden><button type="button" class="btn btn-primary btn-block">Enregistrer le nouvel ordre</button></div>
    `,
  });

  const list = document.querySelector('[data-rows]');
  const saveBox = document.querySelector('[data-order-save]');
  list.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-move]');
    if (!btn) return;
    const li = btn.closest('li');
    if (btn.dataset.move === 'up' && li.previousElementSibling) li.previousElementSibling.before(li);
    if (btn.dataset.move === 'down' && li.nextElementSibling) li.nextElementSibling.after(li);
    [...list.children].forEach((row, i, arr) => {
      row.querySelector('[data-move=up]').disabled = i === 0;
      row.querySelector('[data-move=down]').disabled = i === arr.length - 1;
    });
    saveBox.hidden = false;
  });
  saveBox.querySelector('button').onclick = (e) => withBusy(e.target, 'Enregistrement…', async () => {
    const order = [...list.querySelectorAll('li[data-id]')].map((li) => li.dataset.id);
    try {
      await update(kind, (d) => { d.items.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)); return d; }, `Admin : nouvel ordre des ${kind}`);
      saveBox.hidden = true;
      toast('Ordre enregistré ✓', 'success');
    } catch (err) { toast(err.message, 'error', 6000); }
  });
}

/* --- Fiche prestation / initiation --- */
async function screenEdit(kind, id) {
  const K = KINDS[kind];
  const isNew = id === 'nouveau';
  $app.innerHTML = shell({ title: isNew ? `Nouvelle ${K.singular}` : 'Modifier', back: `#/${kind}`, body: '<p class="meta">Chargement…</p>' });
  let data;
  try { data = await load(kind, { force: true }); } catch (err) { return fail(err); }
  const item = isNew ? {} : data.items.find((i) => i.id === id);
  if (!item) return fail(new Error('Élément introuvable.'), `#/${kind}`);
  const key = `${kind}:${isNew ? 'nouveau' : id}`;
  const pending = { photo: null, removePhoto: false };

  const common = `
    ${field('Titre', 'titre', item.titre || '', { required: true })}
    ${field('Sous-titre', 'sousTitre', item.sousTitre || '', { rows: 2, hint: 'Une phrase qui résume le soin.' })}
    ${photoField('Photo', item.image)}
  `;
  const specific = kind === 'prestations' ? `
    ${field('Description', 'description', item.description || '', { rows: 6, hint: 'Sépare les paragraphes par une ligne vide.' })}
    ${chipsField('Bénéfices', 'benefices', item.benefices, 'Ex. Lâcher-prise')}
    <div class="grid-2">${field('Durée', 'duree', item.duree || '', { placeholder: 'Ex. 1 h' })}${field('Tarif', 'prix', item.prix || '', { placeholder: 'Ex. 70 €' })}</div>
    ${field('Lien de réservation (facultatif)', 'lienReservation', item.lienReservation || '', { type: 'url', hint: 'Vide = lien de réservation général du site.' })}
  ` : `
    ${blocsField(item.blocs && item.blocs.length ? item.blocs : [{ titre: 'Cette initiation vous permet', points: [] }, { titre: 'Idéale si vous souhaitez', points: [] }])}
    ${field('Note', 'note', item.note ?? 'Attestation délivrée à la fin de l’initiation.', {})}
    <div class="grid-2">${field('Durée', 'duree', item.duree || '', { placeholder: 'Ex. 2 jours' })}${field('Tarif', 'prix', item.prix || '', { placeholder: 'Ex. 250 €' })}</div>
    ${field('Prochaines dates', 'prochainesDates', item.prochainesDates || '', { placeholder: 'Ex. 14–15 mars 2027', hint: 'Affiché en badge sur la carte si rempli.' })}
  `;

  $app.innerHTML = shell({
    title: isNew ? `Nouvelle ${K.singular}` : item.titre, back: `#/${kind}`,
    body: `
      ${draftBanner(key)}
      <form id="edit" class="form" novalidate>
        ${common}
        ${specific}
        ${toggleField('Visible sur le site', 'visible', item.visible !== false, 'Décoche pour préparer une fiche sans la publier.')}
        <div class="form-actions">
          <button type="submit" class="btn btn-primary btn-block">${isNew ? 'Publier' : 'Enregistrer'}</button>
          ${isNew ? '' : '<button type="button" class="btn btn-danger btn-block" data-delete>Supprimer</button>'}
        </div>
      </form>
    `,
  });

  const form = document.getElementById('edit');
  bindChips(form); bindPhoto(form, pending); bindBlocs(form); bindDraft(form, key, pending); bindDraftBanner(form, key);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = readForm(form);
    if (!f.titre.trim()) { toast('Le titre est obligatoire.', 'error'); form.elements.titre.focus(); return; }
    const btn = form.querySelector('button[type=submit]');
    await withBusy(btn, 'Publication…', async () => {
      try {
        let image = item.image || '';
        if (pending.photo) {
          const name = `${slugify(f.titre)}-${Date.now().toString(36)}.${pending.photo.ext}`;
          await state.client.putBinary(`${CFG.uploadsDir}/${name}`, pending.photo.base64, `Admin : photo « ${f.titre.trim()} »`);
          image = `${CFG.sitePublicPrefix}/${name}`;
        } else if (pending.removePhoto) {
          image = '';
        }
        const next = buildItem(kind, item, f, form, image);
        await update(kind, (d) => {
          if (isNew) {
            next.id = uniqueId(slugify(f.titre), d.items.map((i) => i.id));
            d.items.push(next);
          } else {
            const idx = d.items.findIndex((i) => i.id === id);
            if (idx === -1) d.items.push(next); else d.items[idx] = next;
          }
          return d;
        }, `Admin : ${isNew ? 'ajout' : 'modification'} ${K.singular} « ${f.titre.trim()} »`);
        clearDraft(key);
        toast(isNew ? 'Ajoutée — publication lancée' : 'Enregistré — publication lancée', 'success');
        location.hash = `#/${kind}`;
      } catch (err) { toast(err.message, 'error', 7000); }
    });
  });

  form.querySelector('[data-delete]')?.addEventListener('click', async (e) => {
    if (!(await confirmDialog(`Supprimer « ${item.titre} » du site ? Cette action est définitive.`, { ok: 'Supprimer', danger: true }))) return;
    await withBusy(e.target, 'Suppression…', async () => {
      try {
        await update(kind, (d) => { d.items = d.items.filter((i) => i.id !== id); return d; }, `Admin : suppression ${K.singular} « ${item.titre} »`);
        clearDraft(key);
        toast('Supprimée — publication lancée', 'success');
        location.hash = `#/${kind}`;
      } catch (err) { toast(err.message, 'error', 7000); }
    });
  });
}

function buildItem(kind, item, f, form, image) {
  const base = { id: item.id, titre: f.titre.trim(), sousTitre: f.sousTitre.trim(), image, imageAlt: item.imageAlt || f.titre.trim() };
  if (kind === 'prestations') {
    return { ...base, description: f.description.trim(), benefices: readChips(form, 'benefices'), duree: f.duree.trim(), prix: f.prix.trim(), lienReservation: f.lienReservation.trim(), visible: !!f.visible };
  }
  return { ...base, blocs: readBlocs(form), note: f.note.trim(), duree: f.duree.trim(), prix: f.prix.trim(), prochainesDates: f.prochainesDates.trim(), visible: !!f.visible };
}
function uniqueId(slug, existing) {
  let id = slug, n = 2;
  while (existing.includes(id)) id = `${slug}-${n++}`;
  return id;
}

/* --- Textes de la page prestations / initiations --- */
async function screenPageTexts(kind) {
  const K = KINDS[kind];
  $app.innerHTML = shell({ title: `Textes — ${K.label}`, back: `#/${kind}`, body: '<p class="meta">Chargement…</p>' });
  let d;
  try { d = await load(kind, { force: true }); } catch (err) { return fail(err); }
  const key = `${kind}:textes`;
  const body = kind === 'prestations' ? `
    ${field('Titre de la page', 'intro.titre', d.intro?.titre || '', { required: true })}
    ${field('Sous-titre', 'intro.sousTitre', d.intro?.sousTitre || '', { rows: 2 })}
    ${field('Mot personnel (en bas de page)', 'motPerso', d.motPerso || '', { rows: 4 })}
    ${field('Rappel (cadre bien-être)', 'rappel', d.rappel || '', { rows: 3 })}
  ` : `
    ${field('Titre de la page', 'intro.titre', d.intro?.titre || '', { required: true })}
    ${field('Accroche', 'intro.sousTitre', d.intro?.sousTitre || '', { rows: 2 })}
    ${field('Texte d’introduction', 'intro.texte', d.intro?.texte || '', { rows: 3 })}
    ${chipsField('Badges', 'intro.badges', d.intro?.badges, 'Ex. Bienveillance')}
    ${field('Titre du bloc « esprit »', 'esprit.titre', d.esprit?.titre || '')}
    ${field('Texte du bloc « esprit »', 'esprit.paragraphes', (d.esprit?.paragraphes || []).join('\n\n'), { rows: 5, hint: 'Sépare les paragraphes par une ligne vide.' })}
    ${field('Titre du bloc « attestation »', 'certification.titre', d.certification?.titre || '')}
    ${field('Texte du bloc « attestation »', 'certification.texte', d.certification?.texte || '', { rows: 3 })}
  `;
  $app.innerHTML = shell({
    title: `Textes — ${K.label}`, back: `#/${kind}`,
    body: `${draftBanner(key)}<form id="edit" class="form" novalidate>${body}<div class="form-actions"><button type="submit" class="btn btn-primary btn-block">Enregistrer</button></div></form>`,
  });
  const form = document.getElementById('edit');
  const pending = {};
  bindChips(form); bindDraft(form, key, pending); bindDraftBanner(form, key);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = readForm(form);
    withBusy(form.querySelector('button[type=submit]'), 'Publication…', async () => {
      try {
        await update(kind, (data) => {
          data.intro = data.intro || {};
          data.intro.titre = f['intro.titre'].trim();
          data.intro.sousTitre = f['intro.sousTitre'].trim();
          if (kind === 'prestations') {
            data.motPerso = f.motPerso.trim();
            data.rappel = f.rappel.trim();
          } else {
            data.intro.texte = f['intro.texte'].trim();
            data.intro.badges = readChips(form, 'intro.badges');
            data.esprit = { titre: f['esprit.titre'].trim(), paragraphes: paragraphsFromText(f['esprit.paragraphes']) };
            data.certification = { titre: f['certification.titre'].trim(), texte: f['certification.texte'].trim() };
          }
          return data;
        }, `Admin : textes de la page ${K.label.toLowerCase()}`);
        clearDraft(key);
        toast('Enregistré — publication lancée', 'success');
        location.hash = `#/${kind}`;
      } catch (err) { toast(err.message, 'error', 7000); }
    });
  });
}

/* --- Page d'accueil --- */
async function screenAccueil() {
  $app.innerHTML = shell({ title: 'Page d’accueil', back: '#/', body: '<p class="meta">Chargement…</p>' });
  let a;
  try { a = await load('accueil', { force: true }); } catch (err) { return fail(err); }
  const key = 'accueil';
  const pending = { photos: {} };

  const sectionsHtml = (a.sections || []).map((s, i) => `
    <details class="acc" ${i === 0 ? '' : ''}>
      <summary><span>${esc(s.kicker || s.titre || `Section ${i + 1}`)}</span><span class="acc-chevron">›</span></summary>
      <div class="acc-body">
        ${field('Petit titre (au-dessus)', `s${i}.kicker`, s.kicker || '')}
        ${field('Titre', `s${i}.titre`, s.titre || '', { required: true })}
        ${field('Accroche (écriture manuscrite)', `s${i}.lead`, s.lead || '')}
        ${chipsField('Mots-clés (pastilles)', `s${i}.puces`, s.puces, 'Ex. Vibrations')}
        <div data-photo-section="${i}">${photoField('Image', s.image, { hint: 'Image de la section (portrait de préférence).' })}</div>
        ${field('Paragraphes', `s${i}.paragraphes`, (s.paragraphes || []).join('\n\n'), { rows: 8, hint: 'Sépare les paragraphes par une ligne vide.' })}
        ${field('Encadré — titre en gras (facultatif)', `s${i}.encadre.titre`, s.encadre?.titre || '')}
        ${field('Encadré — texte', `s${i}.encadre.texte`, s.encadre?.texte || '', { rows: 3 })}
        ${field('Paragraphes après l’encadré', `s${i}.paragraphesApres`, (s.paragraphesApres || []).join('\n\n'), { rows: 4 })}
      </div>
    </details>`).join('');

  $app.innerHTML = shell({
    title: 'Page d’accueil', back: '#/',
    body: `${draftBanner(key)}
    <form id="edit" class="form" novalidate>
      <h2 class="form-h">Haut de page</h2>
      ${field('Grand titre', 'hero.titre', a.hero?.titre || '', { required: true, rows: 2 })}
      ${field('Phrase manuscrite', 'hero.sousTitre', a.hero?.sousTitre || '', { rows: 2 })}
      <div class="grid-2">${field('Texte du bouton principal', 'hero.boutonTexte', a.hero?.boutonTexte || '')}${field('Texte du lien secondaire', 'hero.lienSecondaireTexte', a.hero?.lienSecondaireTexte || '')}</div>

      <h2 class="form-h">Les trois sections</h2>
      ${sectionsHtml}

      <h2 class="form-h">Aperçu des soins</h2>
      <div class="grid-2">${field('Titre', 'apercuSoins.titre', a.apercuSoins?.titre || '')}${field('Texte du bouton', 'apercuSoins.boutonTexte', a.apercuSoins?.boutonTexte || '')}</div>
      ${field('Accroche', 'apercuSoins.lead', a.apercuSoins?.lead || '')}

      <h2 class="form-h">Bandeau initiations</h2>
      ${field('Titre', 'apercuInitiations.titre', a.apercuInitiations?.titre || '')}
      ${field('Texte', 'apercuInitiations.texte', a.apercuInitiations?.texte || '', { rows: 3 })}
      ${field('Texte du bouton', 'apercuInitiations.boutonTexte', a.apercuInitiations?.boutonTexte || '')}

      <h2 class="form-h">Bloc contact</h2>
      ${field('Titre', 'contact.titre', a.contact?.titre || '')}
      ${field('Texte', 'contact.texte', a.contact?.texte || '', { rows: 3 })}
      ${field('Texte du bouton', 'contact.boutonTexte', a.contact?.boutonTexte || '')}
      ${field('Citation de fin', 'citation', a.citation || '')}

      <div class="form-actions"><button type="submit" class="btn btn-primary btn-block">Enregistrer</button></div>
    </form>`,
  });

  const form = document.getElementById('edit');
  bindChips(form); bindDraft(form, key, pending); bindDraftBanner(form, key);
  form.querySelectorAll('[data-photo-section]').forEach((box) => {
    const i = box.dataset.photoSection;
    const p = { photo: null, removePhoto: false };
    pending.photos[i] = p;
    bindPhoto(box, p);
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = readForm(form);
    withBusy(form.querySelector('button[type=submit]'), 'Publication…', async () => {
      try {
        const images = {};
        for (const [i, p] of Object.entries(pending.photos)) {
          if (p.photo) {
            const name = `accueil-${slugify(f[`s${i}.titre`] || `section-${i}`)}-${Date.now().toString(36)}.${p.photo.ext}`;
            await state.client.putBinary(`${CFG.uploadsDir}/${name}`, p.photo.base64, `Admin : image section « ${f[`s${i}.titre`]} »`);
            images[i] = `${CFG.sitePublicPrefix}/${name}`;
          } else if (p.removePhoto) images[i] = '';
        }
        await update('accueil', (d) => {
          d.hero = { ...(d.hero || {}), titre: f['hero.titre'].trim(), sousTitre: f['hero.sousTitre'].trim(), boutonTexte: f['hero.boutonTexte'].trim(), lienSecondaireTexte: f['hero.lienSecondaireTexte'].trim() };
          (d.sections || []).forEach((s, i) => {
            s.kicker = f[`s${i}.kicker`].trim();
            s.titre = f[`s${i}.titre`].trim();
            s.lead = f[`s${i}.lead`].trim();
            s.puces = readChips(form, `s${i}.puces`);
            if (images[i] !== undefined) { s.image = images[i]; if (images[i]) s.imageContain = false; }
            s.paragraphes = paragraphsFromText(f[`s${i}.paragraphes`]);
            s.encadre = { titre: f[`s${i}.encadre.titre`].trim(), texte: f[`s${i}.encadre.texte`].trim() };
            s.paragraphesApres = paragraphsFromText(f[`s${i}.paragraphesApres`]);
          });
          d.apercuSoins = { titre: f['apercuSoins.titre'].trim(), lead: f['apercuSoins.lead'].trim(), boutonTexte: f['apercuSoins.boutonTexte'].trim() };
          d.apercuInitiations = { titre: f['apercuInitiations.titre'].trim(), texte: f['apercuInitiations.texte'].trim(), boutonTexte: f['apercuInitiations.boutonTexte'].trim() };
          d.contact = { titre: f['contact.titre'].trim(), texte: f['contact.texte'].trim(), boutonTexte: f['contact.boutonTexte'].trim() };
          d.citation = f.citation.trim();
          return d;
        }, 'Admin : textes de la page d’accueil');
        clearDraft(key);
        toast('Enregistré — publication lancée', 'success');
        location.hash = '#/';
      } catch (err) { toast(err.message, 'error', 7000); }
    });
  });
}

/* --- Réglages du site --- */
async function screenReglages() {
  $app.innerHTML = shell({ title: 'Réglages du site', back: '#/', body: '<p class="meta">Chargement…</p>' });
  let s;
  try { s = await load('site', { force: true }); } catch (err) { return fail(err); }
  const key = 'site';
  $app.innerHTML = shell({
    title: 'Réglages du site', back: '#/',
    body: `${draftBanner(key)}
    <form id="edit" class="form" novalidate>
      ${field('Nom du site', 'nom', s.nom || '', { required: true })}
      ${field('Slogan', 'slogan', s.slogan || '')}
      ${field('E-mail de contact', 'email', s.email || '', { type: 'email', required: true })}
      ${field('Téléphone', 'telephone', s.telephone || '', { type: 'tel', placeholder: '06 00 00 00 00' })}
      ${field('Lien de réservation (Liberlo…)', 'lienReservation', s.lienReservation || '', { type: 'url', required: true })}
      ${field('Zone (affichée sur le site)', 'zone', s.zone || '', { placeholder: 'Ex. Lizos, près de Tarbes' })}
      ${field('Horaires', 'horaires', s.horaires || '', { placeholder: 'Ex. Sur rendez-vous' })}
      ${field('Description pour Google (150 caractères env.)', 'descriptionSeo', s.descriptionSeo || '', { rows: 3 })}
      ${field('Texte des villes desservies (pied de page)', 'texteSeoLocal', s.texteSeoLocal || '', { rows: 4 })}
      <div class="grid-2">${field('Instagram (lien)', 'instagram', s.instagram || '', { type: 'url' })}${field('Facebook (lien)', 'facebook', s.facebook || '', { type: 'url' })}</div>
      <div class="form-actions"><button type="submit" class="btn btn-primary btn-block">Enregistrer</button></div>
    </form>`,
  });
  const form = document.getElementById('edit');
  bindDraft(form, key, {}); bindDraftBanner(form, key);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = readForm(form);
    if (!f.nom.trim() || !f.email.trim() || !f.lienReservation.trim()) return toast('Nom, e-mail et lien de réservation sont obligatoires.', 'error');
    withBusy(form.querySelector('button[type=submit]'), 'Publication…', async () => {
      try {
        await update('site', (d) => {
          for (const k of ['nom', 'slogan', 'email', 'telephone', 'lienReservation', 'zone', 'horaires', 'descriptionSeo', 'texteSeoLocal', 'instagram', 'facebook']) d[k] = f[k].trim();
          return d;
        }, 'Admin : réglages du site');
        clearDraft(key);
        toast('Enregistré — publication lancée', 'success');
        location.hash = '#/';
      } catch (err) { toast(err.message, 'error', 7000); }
    });
  });
}

function fail(err, back = '#/') {
  $app.innerHTML = shell({ title: 'Oups', back, body: `<div class="banner banner-error">${esc(err.message)}</div><a class="btn btn-secondary btn-block" href="${esc(back)}">Retour</a>`, statusbar: false });
  if (err.status === 401) { clearSession(); state.client = null; setTimeout(() => screenLogin(err.message), 1200); }
}

/* =====================================================================
   Routeur
   ===================================================================== */
function route() {
  if (!state.client) return screenLogin();
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [a, b] = parts;
  window.scrollTo(0, 0);
  if (!a) return screenHome();
  if (a === 'accueil') return screenAccueil();
  if (a === 'reglages') return screenReglages();
  if (KINDS[a]) {
    if (!b) return screenList(a);
    if (b === 'textes') return screenPageTexts(a);
    return screenEdit(a, b);
  }
  location.hash = '#/';
}

function init() {
  const s = loadSession();
  if (s?.token && s?.repo) {
    state.session = s;
    try { state.client = createClient({ token: s.token, repo: s.repo, branch: s.branch || 'main' }); } catch { state.client = null; }
  }
  window.addEventListener('hashchange', route);
  route();
}
init();
