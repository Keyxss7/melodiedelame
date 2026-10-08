import { esc, safeUrl, chips } from '../lib/html.js';
import { layout } from '../partials/layout.js';
import { localBusiness } from '../lib/seo.js';

function splitSection(section, index) {
  const flip = index % 2 === 1 ? ' split--flip' : '';
  const enc = section.encadre || {};
  const hasEncadre = enc.titre || enc.texte;
  return `
<section class="split${flip}" id="${esc(section.id)}" aria-labelledby="${esc(section.id)}-titre">
  <div class="split-card">
    <figure class="split-media">
      ${section.image ? `<img src="${safeUrl(section.image)}" alt="${esc(section.imageAlt || '')}"${section.imageContain ? ' class="is-contain"' : ''} loading="lazy" decoding="async" width="800" height="1000">` : ''}
    </figure>
    <div class="split-body">
      ${section.kicker ? `<p class="kicker">${esc(section.kicker)}</p>` : ''}
      <h2 class="section-title" id="${esc(section.id)}-titre">${esc(section.titre)}</h2>
      ${section.lead ? `<p class="lead">${esc(section.lead)}</p>` : ''}
      ${chips(section.puces)}
      <div class="prose">
        ${(section.paragraphes || []).map((p) => `<p>${esc(p)}</p>`).join('\n')}
        ${hasEncadre ? `<aside class="callout">${enc.titre ? `<strong>${esc(enc.titre)}</strong> ` : ''}${esc(enc.texte)}</aside>` : ''}
        ${(section.paragraphesApres || []).map((p) => `<p>${esc(p)}</p>`).join('\n')}
      </div>
    </div>
  </div>
</section>`;
}

function soinCard(p, site) {
  return `
<li class="soin-card">
  <a href="prestations.html#${esc(p.id)}" class="soin-link">
    <figure class="soin-media">
      ${p.image ? `<img src="${safeUrl(p.image)}" alt="${esc(p.imageAlt || p.titre)}" loading="lazy" decoding="async" width="640" height="480">` : ''}
    </figure>
    <h3 class="soin-title">${esc(p.titre)}</h3>
    ${p.sousTitre ? `<p class="soin-sub">${esc(p.sousTitre)}</p>` : ''}
    <span class="soin-more">Découvrir ce soin</span>
  </a>
</li>`;
}

export function render({ site, accueil, prestations }) {
  const visibles = (prestations.items || []).filter((p) => p.visible !== false);
  const apercu = visibles.slice(0, 3);
  const h = accueil.hero;
  const tel = site.telephone ? site.telephone.replace(/\D/g, '') : '';
  const telHref = tel ? `tel:+33${tel.replace(/^0/, '')}` : '';

  const body = `
<section class="hero" aria-labelledby="hero-titre">
  <div class="hero-art" aria-hidden="true">
    <img src="images/mandala.webp" alt="" width="900" height="900" decoding="async" fetchpriority="low" class="hero-mandala">
    <span class="ring ring-1"></span><span class="ring ring-2"></span><span class="ring ring-3"></span>
  </div>
  <div class="hero-content">
    <h1 class="hero-title" id="hero-titre">${esc(h.titre)}</h1>
    <p class="hero-lead">${esc(h.sousTitre)}</p>
    <div class="hero-actions">
      <a class="btn btn-primary" href="${safeUrl(site.lienReservation)}" target="_blank" rel="noopener">${esc(h.boutonTexte)}</a>
      <a class="btn btn-ghost" href="#soins">${esc(h.lienSecondaireTexte || 'Découvrir les soins')}</a>
    </div>
    <p class="hero-meta">${esc(site.zone)} — ${esc(site.horaires)}</p>
  </div>
</section>

${(accueil.sections || []).map(splitSection).join('\n')}

<section class="soins" id="soins" aria-labelledby="soins-titre">
  <div class="section-head">
    <h2 class="section-title" id="soins-titre">${esc(accueil.apercuSoins?.titre || 'Mes soins')}</h2>
    ${accueil.apercuSoins?.lead ? `<p class="lead">${esc(accueil.apercuSoins.lead)}</p>` : ''}
  </div>
  <ul class="soins-grid" role="list">
    ${apercu.map((p) => soinCard(p, site)).join('\n')}
  </ul>
  <div class="section-actions">
    <a class="btn btn-secondary" href="prestations.html">${esc(accueil.apercuSoins?.boutonTexte || 'Voir toutes les prestations')}</a>
  </div>
</section>

<section class="teaser" aria-labelledby="initiations-titre">
  <div class="teaser-card">
    <div>
      <h2 class="section-title" id="initiations-titre">${esc(accueil.apercuInitiations?.titre || 'Initiations')}</h2>
      <p>${esc(accueil.apercuInitiations?.texte || '')}</p>
    </div>
    <a class="btn btn-secondary" href="formations.html">${esc(accueil.apercuInitiations?.boutonTexte || 'Découvrir les initiations')}</a>
  </div>
</section>

<section class="contact" id="contact" aria-labelledby="contact-titre">
  <div class="contact-card">
    <div class="contact-main">
      <h2 class="section-title" id="contact-titre">${esc(accueil.contact?.titre || 'Prendre rendez-vous')}</h2>
      <p>${esc(accueil.contact?.texte || '')}</p>
      <div class="hero-actions">
        <a class="btn btn-primary" href="${safeUrl(site.lienReservation)}" target="_blank" rel="noopener">${esc(accueil.contact?.boutonTexte || 'Réserver en ligne')}</a>
        <a class="btn btn-ghost" href="mailto:${esc(site.email)}">Écrire un e-mail</a>
      </div>
    </div>
    <dl class="contact-details">
      <div><dt>E-mail</dt><dd><a href="mailto:${esc(site.email)}">${esc(site.email)}</a></dd></div>
      ${telHref ? `<div><dt>Téléphone</dt><dd><a href="${telHref}">${esc(site.telephone)}</a></dd></div>` : ''}
      <div><dt>Où</dt><dd>${esc(site.zone)}</dd></div>
      <div><dt>Quand</dt><dd>${esc(site.horaires)}</dd></div>
    </dl>
  </div>
  ${accueil.citation ? `<p class="citation">${esc(accueil.citation)}</p>` : ''}
</section>
`;

  return layout({
    site,
    page: {
      title: '',
      description: site.descriptionSeo,
      path: 'index.html',
      active: 'accueil',
      bodyClass: 'page-accueil',
      jsonLd: [localBusiness(site)],
    },
    body,
  });
}
