#!/usr/bin/env node
/**
 * Génère le site statique dans dist/ à partir de content/*.json et src/.
 *
 *   node build.js            → build une fois
 *   node build.js --serve    → build + serveur local (http://localhost:4173) + rebuild à chaque modification
 *   node build.js --out X    → build dans un autre dossier
 *
 * Aucune dépendance : uniquement les modules Node intégrés.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');
const CONTENT = path.join(ROOT, 'content');

/* ---------- Contenu ---------- */

export function loadContent(contentDir = CONTENT) {
  const read = (name) => {
    const file = path.join(contentDir, name);
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      throw new Error(`Impossible de lire ${name} : ${err.message}`);
    }
  };
  const data = {
    site: read('site.json'),
    accueil: read('accueil.json'),
    prestations: read('prestations.json'),
    formations: read('formations.json'),
  };
  validate(data);
  return data;
}

function validate({ site, accueil, prestations, formations }) {
  const errors = [];
  if (!site.nom) errors.push('site.json : « nom » manquant');
  if (!site.url) errors.push('site.json : « url » manquante');
  if (!site.email) errors.push('site.json : « email » manquant');
  if (!site.lienReservation) errors.push('site.json : « lienReservation » manquant');
  if (!accueil.hero?.titre) errors.push('accueil.json : « hero.titre » manquant');
  if (!Array.isArray(prestations.items)) errors.push('prestations.json : « items » doit être une liste');
  if (!Array.isArray(formations.items)) errors.push('formations.json : « items » doit être une liste');
  for (const [name, list] of [['prestations', prestations.items || []], ['formations', formations.items || []]]) {
    const ids = new Set();
    list.forEach((it, i) => {
      if (!it.id) errors.push(`${name}.json : l'élément n°${i + 1} n'a pas d'« id »`);
      if (!it.titre) errors.push(`${name}.json : l'élément n°${i + 1} n'a pas de « titre »`);
      if (ids.has(it.id)) errors.push(`${name}.json : id en double « ${it.id} »`);
      ids.add(it.id);
    });
  }
  if (errors.length) throw new Error('Contenu invalide :\n - ' + errors.join('\n - '));
}

/* ---------- Pages ---------- */

export async function renderPages(data) {
  // Import dynamique pour que --serve recharge les templates modifiés (cache-busting par query).
  const bust = `?t=${Date.now()}`;
  const mod = (p) => import(pathToFileURL(path.join(SRC, p)).href + bust);
  const [index, prestations, formations, legal] = await Promise.all([
    mod('templates/index.js'),
    mod('templates/prestations.js'),
    mod('templates/formations.js'),
    mod('templates/legal.js'),
  ]);

  return {
    'index.html': index.render(data),
    'prestations.html': prestations.render(data),
    'formations.html': formations.render(data),
    'mentions-legales.html': legal.renderMentions(data),
    'politiques-de-confidentialites.html': legal.renderConfidentialite(data),
    '404.html': legal.renderNotFound(data),
  };
}

export function sitemap(site, pages) {
  const base = site.url.replace(/\/$/, '');
  const today = new Date().toISOString().slice(0, 10);
  const urls = pages
    .filter((p) => p !== '404.html')
    .map((p) => {
      const loc = p === 'index.html' ? `${base}/` : `${base}/${p}`;
      const priority = p === 'index.html' ? '1.0' : /legales|confidentialites/.test(p) ? '0.3' : '0.8';
      return `  <url><loc>${loc}</loc><lastmod>${today}</lastmod><priority>${priority}</priority></url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/* ---------- Fichiers ---------- */

function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, entry.name);
    const d = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

export async function build({ out = path.join(ROOT, 'dist'), contentDir = CONTENT, quiet = false } = {}) {
  const started = Date.now();
  const data = loadContent(contentDir);
  const pages = await renderPages(data);

  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });

  for (const [file, html] of Object.entries(pages)) {
    fs.writeFileSync(path.join(out, file), html);
  }
  fs.writeFileSync(path.join(out, 'sitemap.xml'), sitemap(data.site, Object.keys(pages)));

  copyDir(path.join(SRC, 'css'), path.join(out, 'css'));
  copyDir(path.join(SRC, 'fonts'), path.join(out, 'fonts'));
  copyDir(path.join(SRC, 'js'), path.join(out, 'js'));
  copyDir(path.join(SRC, 'images'), path.join(out, 'images'));
  copyDir(path.join(SRC, 'admin'), path.join(out, 'admin'));
  copyDir(path.join(SRC, 'static'), out); // CNAME, robots.txt, favicon, icons, manifest…
  fs.writeFileSync(path.join(out, '.nojekyll'), '');

  if (!quiet) console.log(`✓ Site généré dans ${path.relative(ROOT, out) || '.'} (${Object.keys(pages).length} pages, ${Date.now() - started} ms)`);
  return { pages: Object.keys(pages), out };
}

/* ---------- Serveur de développement ---------- */

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function serve(out, port = 4173) {
  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (urlPath.endsWith('/')) urlPath += 'index.html';
    let file = path.join(out, urlPath);
    if (!file.startsWith(out)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) {
      file = path.join(out, '404.html');
      res.statusCode = 404;
    }
    res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    fs.createReadStream(file).pipe(res);
  });
  server.listen(port, () => console.log(`▶ Aperçu : http://localhost:${port}  (Ctrl+C pour arrêter)`));

  let timer = null;
  const rebuild = () => {
    clearTimeout(timer);
    timer = setTimeout(() => build({ out }).catch((e) => console.error('✗ ' + e.message)), 120);
  };
  for (const dir of [SRC, CONTENT]) {
    fs.watch(dir, { recursive: true }, rebuild);
  }
}

/* ---------- CLI ---------- */

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const out = outIdx >= 0 ? path.resolve(args[outIdx + 1]) : path.join(ROOT, 'dist');
  build({ out })
    .then(() => { if (args.includes('--serve')) serve(out); })
    .catch((err) => { console.error('✗ ' + err.message); process.exit(1); });
}
