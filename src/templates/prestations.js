import { esc, safeUrl, chips, paragraphs } from '../lib/html.js';
import { layout } from '../partials/layout.js';
import { localBusiness, breadcrumb, serviceList } from '../lib/seo.js';

function metaBadges(p) {
  const parts = [];
  if (p.duree) parts.push(`<span class="badge badge-time">${esc(p.duree)}</span>`);
  if (p.prix) parts.push(`<span class="badge badge-price">${esc(p.prix)}</span>`);
  return parts.length ? `<p class="presta-meta">${parts.join('')}</p>` : '';
}

function prestaCard(p, site) {
  const lien = p.lienReservation || site.lienReservation;
  return `
<article class="presta" id="${esc(p.id)}" aria-labelledby="${esc(p.id)}-titre">
  <figure class="presta-media">
    ${p.image ? `<img src="${safeUrl(p.image)}" alt="${esc(p.imageAlt || p.titre)}" loading="lazy" decoding="async" width="800" height="600">` : ''}
  </figure>
  <div class="presta-body">
    <h2 class="presta-title" id="${esc(p.id)}-titre">${esc(p.titre)}</h2>
    ${p.sousTitre ? `<p class="presta-sub">${esc(p.sousTitre)}</p>` : ''}
    ${metaBadges(p)}
    <div class="prose">${paragraphs(p.description)}</div>
    ${chips(p.benefices, 'chips chips-plus')}
    <div class="presta-actions">
      <a class="btn btn-primary" href="${safeUrl(lien)}" target="_blank" rel="noopener">Réserver ce soin</a>
    </div>
  </div>
</article>`;
}

export function render({ site, prestations }) {
  const visibles = (prestations.items || []).filter((p) => p.visible !== false);
  const intro = prestations.intro || {};

  const body = `
<header class="page-head">
  <h1 class="page-title">${esc(intro.titre || 'Mes prestations')}</h1>
  ${intro.sousTitre ? `<p class="lead">${esc(intro.sousTitre)}</p>` : ''}
</header>

<section class="presta-list" aria-label="Liste des prestations">
  ${visibles.length ? visibles.map((p) => prestaCard(p, site)).join('\n') : '<p class="empty">Les prestations arrivent bientôt.</p>'}
</section>

<section class="presta-notes" aria-label="Mot de la praticienne">
  ${prestations.motPerso ? `<blockquote class="note-perso">${esc(prestations.motPerso)}</blockquote>` : ''}
  ${prestations.rappel ? `<p class="note-rappel">${esc(prestations.rappel)}</p>` : ''}
</section>
`;

  return layout({
    site,
    page: {
      title: intro.titre || 'Mes prestations',
      description: `Sonothérapie, massages aux bols tibétains, LaHoChi, relaxation sonore… Découvrez les soins proposés par ${site.nom} à ${site.adresse?.ville || 'Lizos'} près de Tarbes.`,
      path: 'prestations.html',
      active: 'prestations',
      bodyClass: 'page-prestations',
      jsonLd: [
        localBusiness(site),
        breadcrumb(site, [{ name: 'Accueil', path: 'index.html' }, { name: 'Prestations', path: 'prestations.html' }]),
        serviceList(site, visibles),
      ],
    },
    body,
  });
}
