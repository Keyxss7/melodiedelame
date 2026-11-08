import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build, loadContent, sitemap } from '../build.js';

// IMPORTANT : ces tests tournent avant chaque publication. Ils ne doivent JAMAIS
// dépendre du vrai contenu (content/*.json), que l'admin modifie librement :
// ils utilisent un jeu de données figé dans tests/fixtures/content.
// Le vrai contenu est seulement vérifié comme « valide et générable ».

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FIXTURES = path.join(ROOT, 'tests', 'fixtures', 'content');
const FILES = ['site.json', 'accueil.json', 'prestations.json', 'formations.json'];

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Copie les fixtures dans un dossier temporaire, en appliquant `mutate(fichier, data)`. */
function fixtureContent(mutate) {
  const to = tmpDir('mda-content-');
  for (const f of FILES) {
    const data = JSON.parse(fs.readFileSync(path.join(FIXTURES, f), 'utf8'));
    if (mutate) mutate(f, data);
    fs.writeFileSync(path.join(to, f), JSON.stringify(data));
  }
  return to;
}

function readFixture(f) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, f), 'utf8'));
}

/* ---------- Vrai contenu : seulement « valide et générable » ---------- */

test('le vrai contenu est valide', () => {
  const data = loadContent();
  assert.ok(Array.isArray(data.prestations.items));
  assert.ok(Array.isArray(data.formations.items));
  assert.ok(Array.isArray(data.accueil.sections));
});

test('le vrai contenu se génère sans erreur', async () => {
  const out = tmpDir('mda-dist-');
  const { pages } = await build({ out, quiet: true });
  assert.ok(pages.includes('index.html'));
  fs.rmSync(out, { recursive: true, force: true });
});

/* ---------- Comportement du générateur (sur les fixtures) ---------- */

test('build génère toutes les pages et les assets', async () => {
  const out = tmpDir('mda-dist-');
  const { pages } = await build({ out, contentDir: FIXTURES, quiet: true });
  for (const p of ['index.html', 'prestations.html', 'formations.html', 'mentions-legales.html', 'politiques-de-confidentialites.html', '404.html']) {
    assert.ok(pages.includes(p), `page manquante : ${p}`);
    assert.ok(fs.existsSync(path.join(out, p)));
  }
  for (const f of ['sitemap.xml', '.nojekyll', 'css/style.css', 'js/site.js', 'admin/index.html', 'CNAME']) {
    assert.ok(fs.existsSync(path.join(out, f)), `fichier manquant : ${f}`);
  }

  const accueil = readFixture('accueil.json');
  const presta = readFixture('prestations.json');

  const index = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  assert.match(index, /<html lang="fr">/);
  assert.ok(index.includes(accueil.hero.titre.replace(/&/g, '&amp;')), 'le titre du héro doit apparaître');
  assert.match(index, /application\/ld\+json/);
  assert.match(index, /id="contact"/);

  const prestaHtml = fs.readFileSync(path.join(out, 'prestations.html'), 'utf8');
  assert.ok(prestaHtml.includes(`id="${presta.items[0].id}"`));
  assert.match(prestaHtml, /Réserver ce soin/);

  const notFound = fs.readFileSync(path.join(out, '404.html'), 'utf8');
  assert.match(notFound, /href="\/css\/style\.css"/, 'les liens de la 404 doivent être absolus');
  assert.match(notFound, /noindex/);
  fs.rmSync(out, { recursive: true, force: true });
});

test('les éléments masqués ne sont pas rendus et le HTML est échappé', async () => {
  let hiddenPresta, hiddenFormation;
  const content = fixtureContent((f, data) => {
    if (f === 'prestations.json') {
      hiddenPresta = data.items[0].id;
      data.items[0].visible = false;
      data.items[1].titre = 'Soin <script>alert(1)</script>';
      data.items[1].duree = '60 min';
      data.items[1].prix = '70 €';
    }
    if (f === 'formations.json') {
      hiddenFormation = data.items[0].id;
      data.items[0].visible = false;
      data.items[1].prochainesDates = '14–15 mars 2027';
    }
  });
  const out = tmpDir('mda-dist-');
  await build({ out, contentDir: content, quiet: true });

  const presta = fs.readFileSync(path.join(out, 'prestations.html'), 'utf8');
  assert.ok(!presta.includes(`id="${hiddenPresta}"`), 'une prestation masquée ne doit pas apparaître');
  assert.doesNotMatch(presta, /<script>alert/);
  assert.match(presta, /Soin &lt;script&gt;/);
  assert.match(presta, /60 min/);
  assert.match(presta, /70 €/);

  const index = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  assert.ok(!index.includes(`prestations.html#${hiddenPresta}"`), 'une prestation masquée ne doit pas être dans l’aperçu');

  const form = fs.readFileSync(path.join(out, 'formations.html'), 'utf8');
  assert.ok(!form.includes(`id="${hiddenFormation}"`), 'une initiation masquée ne doit pas apparaître');
  assert.match(form, /14–15 mars 2027/);

  fs.rmSync(out, { recursive: true, force: true });
  fs.rmSync(content, { recursive: true, force: true });
});

test('les sections de l’accueil suivent l’ordre du contenu, avec ou sans image', async () => {
  const content = fixtureContent((f, data) => {
    if (f === 'accueil.json') {
      data.sections.reverse();
      data.sections.push({
        id: 'nouvelle-section', kicker: '', titre: 'Une section sans image', lead: '', puces: [],
        image: '', paragraphes: ['Texte <b>seul</b>.'], encadre: { titre: '', texte: '' }, paragraphesApres: [],
      });
    }
  });
  const out = tmpDir('mda-dist-');
  await build({ out, contentDir: content, quiet: true });
  const index = fs.readFileSync(path.join(out, 'index.html'), 'utf8');

  const ids = [...index.matchAll(/<section class="split[^"]*" id="([^"]+)"/g)].map((m) => m[1]);
  const expected = readFixture('accueil.json').sections.map((s) => s.id).reverse().concat('nouvelle-section');
  assert.deepEqual(ids, expected);

  const block = index.slice(index.indexOf('id="nouvelle-section"'), index.indexOf('</section>', index.indexOf('id="nouvelle-section"')));
  assert.match(block, /split-card--text/);
  assert.doesNotMatch(block, /<figure/);
  assert.match(block, /Texte &lt;b&gt;seul&lt;\/b&gt;\./);

  fs.rmSync(out, { recursive: true, force: true });
  fs.rmSync(content, { recursive: true, force: true });
});

test('un contenu invalide fait échouer le build avec un message clair', async () => {
  const content = fixtureContent((f, data) => {
    if (f === 'prestations.json') data.items.push({ id: data.items[0].id, titre: 'Doublon' });
  });
  await assert.rejects(() => build({ out: tmpDir('mda-dist-'), contentDir: content, quiet: true }), /id en double/);
  fs.rmSync(content, { recursive: true, force: true });
});

test('une section d’accueil sans titre ou en double fait échouer le build', async () => {
  const noTitle = fixtureContent((f, data) => { if (f === 'accueil.json') data.sections[0].titre = ''; });
  await assert.rejects(() => build({ out: tmpDir('mda-dist-'), contentDir: noTitle, quiet: true }), /accueil\.json.*titre/);
  const dup = fixtureContent((f, data) => { if (f === 'accueil.json') data.sections[1].id = data.sections[0].id; });
  await assert.rejects(() => build({ out: tmpDir('mda-dist-'), contentDir: dup, quiet: true }), /accueil\.json.*id en double/);
  fs.rmSync(noTitle, { recursive: true, force: true });
  fs.rmSync(dup, { recursive: true, force: true });
});

test('sitemap liste les pages publiques sans la 404', () => {
  const xml = sitemap({ url: 'https://melodiedelame.fr/' }, ['index.html', 'prestations.html', '404.html']);
  assert.match(xml, /<loc>https:\/\/melodiedelame\.fr\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/melodiedelame\.fr\/prestations\.html<\/loc>/);
  assert.doesNotMatch(xml, /404/);
});
