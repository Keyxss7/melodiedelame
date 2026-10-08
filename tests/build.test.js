import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build, loadContent, sitemap } from '../build.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function copyContent(to, mutate) {
  fs.mkdirSync(to, { recursive: true });
  for (const f of ['site.json', 'accueil.json', 'prestations.json', 'formations.json']) {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', f), 'utf8'));
    if (mutate) mutate(f, data);
    fs.writeFileSync(path.join(to, f), JSON.stringify(data));
  }
}

test('le contenu réel est valide', () => {
  const data = loadContent();
  assert.ok(data.prestations.items.length >= 1);
  assert.ok(data.formations.items.length >= 1);
});

test('build génère toutes les pages et les assets', async () => {
  const out = tmpDir('mda-dist-');
  const { pages } = await build({ out, quiet: true });
  for (const p of ['index.html', 'prestations.html', 'formations.html', 'mentions-legales.html', 'politiques-de-confidentialites.html', '404.html']) {
    assert.ok(pages.includes(p), `page manquante : ${p}`);
    assert.ok(fs.existsSync(path.join(out, p)));
  }
  assert.ok(fs.existsSync(path.join(out, 'sitemap.xml')));
  assert.ok(fs.existsSync(path.join(out, '.nojekyll')));
  assert.ok(fs.existsSync(path.join(out, 'css', 'style.css')));
  assert.ok(fs.existsSync(path.join(out, 'js', 'site.js')));
  assert.ok(fs.existsSync(path.join(out, 'admin', 'index.html')));
  assert.ok(fs.existsSync(path.join(out, 'CNAME')));

  const index = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  assert.match(index, /<html lang="fr">/);
  assert.match(index, /Sonothérapie &amp; accompagnement bien-être/);
  assert.match(index, /application\/ld\+json/);
  assert.match(index, /id="contact"/);

  const presta = fs.readFileSync(path.join(out, 'prestations.html'), 'utf8');
  assert.match(presta, /id="caresse-vibratoire"/);
  assert.match(presta, /Réserver ce soin/);

  const notFound = fs.readFileSync(path.join(out, '404.html'), 'utf8');
  assert.match(notFound, /href="\/css\/style\.css"/, 'les liens de la 404 doivent être absolus');
  assert.match(notFound, /noindex/);
  fs.rmSync(out, { recursive: true, force: true });
});

test('les éléments masqués ne sont pas rendus et le HTML est échappé', async () => {
  const content = tmpDir('mda-content-');
  copyContent(content, (f, data) => {
    if (f === 'prestations.json') {
      data.items[0].visible = false;
      data.items[1].titre = 'Soin <script>alert(1)</script>';
      data.items[1].duree = '60 min';
      data.items[1].prix = '70 €';
    }
    if (f === 'formations.json') {
      data.items[0].visible = false;
      data.items[1].prochainesDates = '14–15 mars 2027';
    }
  });
  const out = tmpDir('mda-dist-');
  await build({ out, contentDir: content, quiet: true });

  const presta = fs.readFileSync(path.join(out, 'prestations.html'), 'utf8');
  assert.doesNotMatch(presta, /id="caresse-vibratoire"/);
  assert.doesNotMatch(presta, /<script>alert/);
  assert.match(presta, /Soin &lt;script&gt;/);
  assert.match(presta, /60 min/);
  assert.match(presta, /70 €/);

  const index = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  assert.doesNotMatch(index, /prestations\.html#caresse-vibratoire/);

  const form = fs.readFileSync(path.join(out, 'formations.html'), 'utf8');
  assert.doesNotMatch(form, /id="lahochi"/);
  assert.match(form, /14–15 mars 2027/);

  fs.rmSync(out, { recursive: true, force: true });
  fs.rmSync(content, { recursive: true, force: true });
});

test('un contenu invalide fait échouer le build avec un message clair', async () => {
  const content = tmpDir('mda-content-');
  copyContent(content, (f, data) => {
    if (f === 'prestations.json') data.items.push({ id: 'caresse-vibratoire', titre: 'Doublon' });
  });
  await assert.rejects(() => build({ out: tmpDir('mda-dist-'), contentDir: content, quiet: true }), /id en double/);
  fs.rmSync(content, { recursive: true, force: true });
});

test('sitemap liste les pages publiques sans la 404', () => {
  const xml = sitemap({ url: 'https://melodiedelame.fr/' }, ['index.html', 'prestations.html', '404.html']);
  assert.match(xml, /<loc>https:\/\/melodiedelame\.fr\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/melodiedelame\.fr\/prestations\.html<\/loc>/);
  assert.doesNotMatch(xml, /404/);
});
