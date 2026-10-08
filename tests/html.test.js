import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, safeUrl, paragraphs, chips, slugify, jsonLd } from '../src/lib/html.js';

test('esc échappe les caractères HTML', () => {
  assert.equal(esc(`<b>"a" & 'b'</b>`), '&lt;b&gt;&quot;a&quot; &amp; &#39;b&#39;&lt;/b&gt;');
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(12), '12');
});

test('safeUrl refuse javascript: et garde les https', () => {
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl('  JavaScript:alert(1)'), '');
  assert.equal(safeUrl('https://liberlo.com/x?a=1&b=2'), 'https://liberlo.com/x?a=1&amp;b=2');
  assert.equal(safeUrl('mailto:a@b.fr'), 'mailto:a@b.fr');
  assert.equal(safeUrl(''), '');
});

test('paragraphs découpe sur les lignes vides et échappe', () => {
  const html = paragraphs('Un <b>\n\nDeux\nTrois', 'txt');
  assert.equal(html, '<p class="txt">Un &lt;b&gt;</p>\n<p class="txt">Deux<br>Trois</p>');
  assert.equal(paragraphs(''), '');
});

test('chips ignore les valeurs vides', () => {
  assert.equal(chips(['A', '', null, 'B']), '<ul class="chips" role="list"><li>A</li><li>B</li></ul>');
  assert.equal(chips([]), '');
});

test('slugify retire accents et apostrophes', () => {
  assert.equal(slugify('Mélodie de l’Âme — Soin LaHoChi'), 'melodie-de-lame-soin-lahochi');
  assert.equal(slugify(''), 'element');
});

test('jsonLd neutralise les balises', () => {
  assert.equal(jsonLd({ a: '</script>' }), '{"a":"\\u003c/script>"}');
});
