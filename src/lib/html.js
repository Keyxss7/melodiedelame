// Petits utilitaires HTML — aucune dépendance.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Échappe une chaîne pour l'insérer dans du HTML (texte ou attribut). */
export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (c) => ESC[c]);
}

/** Échappe une URL d'attribut href/src : refuse javascript: et data: sauf images. */
export function safeUrl(value) {
  const v = String(value ?? '').trim();
  if (!v) return '';
  if (/^\s*(javascript|vbscript):/i.test(v)) return '';
  return esc(v);
}

/** Transforme un texte avec sauts de ligne en paragraphes HTML échappés. */
export function paragraphs(text, className = '') {
  if (!text) return '';
  const cls = className ? ` class="${esc(className)}"` : '';
  return String(text)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p${cls}>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

/** Liste <li> échappée à partir d'un tableau de chaînes. */
export function listItems(items) {
  return (items || []).filter(Boolean).map((i) => `<li>${esc(i)}</li>`).join('\n');
}

/** Pastilles (chips). */
export function chips(items, className = 'chips') {
  const list = (items || []).filter(Boolean);
  if (!list.length) return '';
  return `<ul class="${esc(className)}" role="list">${list.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
}

/** Slug URL-safe à partir d'un titre (accents retirés). */
export function slugify(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'element';
}

/** Rend une condition : `when(cond, () => html)` */
export function when(cond, fn) {
  return cond ? fn() : '';
}

/** Encode un objet en JSON sûr pour <script type="application/ld+json">. */
export function jsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}
