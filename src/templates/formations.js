import { esc, safeUrl, chips, listItems } from '../lib/html.js';
import { layout } from '../partials/layout.js';
import { localBusiness, breadcrumb, courseList } from '../lib/seo.js';

function mailto(site, f) {
  const subject = encodeURIComponent(`Infos — ${f.titre}`);
  const body = encodeURIComponent(`Bonjour,\n\nJe souhaite recevoir plus d’informations sur « ${f.titre} » (dates, durée, lieu, tarif).\n\nMerci !`);
  return `mailto:${site.email}?subject=${subject}&body=${body}`;
}

function formationCard(f, site) {
  const meta = [];
  if (f.prochainesDates) meta.push(`<span class="badge badge-date">${esc(f.prochainesDates)}</span>`);
  if (f.duree) meta.push(`<span class="badge badge-time">${esc(f.duree)}</span>`);
  if (f.prix) meta.push(`<span class="badge badge-price">${esc(f.prix)}</span>`);

  return `
<article class="formation${f.image ? ' has-image' : ''}" id="${esc(f.id)}" aria-labelledby="${esc(f.id)}-titre">
  ${f.image ? `<figure class="formation-media"><img src="${safeUrl(f.image)}" alt="${esc(f.imageAlt || f.titre)}" loading="lazy" decoding="async" width="1200" height="520"></figure>` : ''}
  <div class="formation-head">
    <h2 class="formation-title" id="${esc(f.id)}-titre">${esc(f.titre)}</h2>
    ${f.sousTitre ? `<p class="formation-sub">${esc(f.sousTitre)}</p>` : ''}
    ${meta.length ? `<p class="presta-meta">${meta.join('')}</p>` : ''}
  </div>
  <div class="formation-blocs">
    ${(f.blocs || []).map((b) => `
    <div class="formation-bloc">
      <h3>${esc(b.titre)}</h3>
      <ul>${listItems(b.points)}</ul>
    </div>`).join('')}
  </div>
  <div class="formation-foot">
    ${f.note ? `<p class="formation-note">${esc(f.note)}</p>` : '<span></span>'}
    <a class="btn btn-primary" href="${mailto(site, f)}">Demander les infos</a>
  </div>
</article>`;
}

export function render({ site, formations }) {
  const visibles = (formations.items || []).filter((f) => f.visible !== false);
  const intro = formations.intro || {};
  const esprit = formations.esprit || {};
  const certif = formations.certification || {};

  const body = `
<header class="page-head">
  <h1 class="page-title">${esc(intro.titre || 'Mes initiations')}</h1>
  ${intro.sousTitre ? `<p class="lead">${esc(intro.sousTitre)}</p>` : ''}
  ${intro.texte ? `<p class="page-text">${esc(intro.texte)}</p>` : ''}
  <div class="hero-actions">
    <a class="btn btn-secondary" href="#modules">Découvrir les modules</a>
    <a class="btn btn-primary" href="mailto:${esc(site.email)}?subject=${encodeURIComponent('Demande d’informations — Initiations')}">Me contacter par e-mail</a>
  </div>
  ${chips(intro.badges)}
</header>

<section class="formation-list" id="modules" aria-label="Modules d’initiation">
  ${visibles.length ? visibles.map((f) => formationCard(f, site)).join('\n') : '<p class="empty">Les prochaines initiations seront annoncées ici.</p>'}
</section>

<section class="info-grid" aria-label="Cadre des initiations">
  <div class="info-card">
    <h2>${esc(esprit.titre || '')}</h2>
    ${(esprit.paragraphes || []).map((p) => `<p>${esc(p)}</p>`).join('')}
  </div>
  <div class="info-card">
    <h2>${esc(certif.titre || 'Attestation')}</h2>
    <p>${esc(certif.texte || '')}</p>
    <p class="info-links">Prochaines dates : <a href="${safeUrl(site.lienReservation)}" target="_blank" rel="noopener">me contacter</a><br>Plus d’informations : <a href="mailto:${esc(site.email)}?subject=${encodeURIComponent('Informations initiations')}">envoyer un e-mail</a></p>
  </div>
</section>
`;

  return layout({
    site,
    page: {
      title: intro.titre || 'Mes initiations',
      description: `Initiations aux bols tibétains, bols de cristal, gongs et LaHoChi avec ${site.nom}, près de Tarbes (65). Un cadre bienveillant, de la pratique et une attestation en fin de module.`,
      path: 'formations.html',
      active: 'formations',
      bodyClass: 'page-formations',
      jsonLd: [
        localBusiness(site),
        breadcrumb(site, [{ name: 'Accueil', path: 'index.html' }, { name: 'Initiations', path: 'formations.html' }]),
        courseList(site, visibles),
      ],
    },
    body,
  });
}
