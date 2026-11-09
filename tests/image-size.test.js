import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { imageSize } from '../src/lib/image-size.js';

const IMAGES = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'src', 'images');

test('lit les dimensions d’un WebP (avec transparence et sans)', () => {
  assert.deepEqual(imageSize(path.join(IMAGES, 'logo1.webp')), { width: 434, height: 448 });
  assert.deepEqual(imageSize(path.join(IMAGES, 'bol.webp')), { width: 1200, height: 1594 });
});

test('lit les dimensions d’un JPEG', () => {
  assert.deepEqual(imageSize(path.join(IMAGES, 'og-image.jpg')), { width: 1200, height: 630 });
});

test('lit les dimensions d’un PNG', () => {
  const icons = path.resolve(IMAGES, '..', 'static', 'icons');
  assert.deepEqual(imageSize(path.join(icons, 'icon-192.png')), { width: 192, height: 192 });
});

test('renvoie null pour un fichier absent ou illisible', () => {
  assert.equal(imageSize(path.join(IMAGES, 'nexiste-pas.webp')), null);
  assert.equal(imageSize(path.resolve(IMAGES, '..', 'css', 'style.css')), null);
});
