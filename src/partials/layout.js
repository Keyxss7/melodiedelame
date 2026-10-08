import { esc, safeUrl, jsonLd } from '../lib/html.js';

const NAV = [
  { key: 'accueil', label: 'Accueil', href: 'index.html' },
  { key: 'sonotherapie', label: 'La sonothérapie', href: 'index.html#sonotherapie' },
  { key: 'prestations', label: 'Prestations', href: 'prestations.html' },
  { key: 'formations', label: 'Initiations', href: 'formations.html' },
  { key: 'contact', label: 'Contact', href: 'index.html#contact' },
];

function navLinks(active, extraClass = '') {
  return NAV.map((item) => {
    const isActive = item.key === active;
    const cls = isActive ? ' class="is-active" aria-current="page"' : '';
    return `<li><a href="${item.href}"${cls}>${esc(item.label)}</a></li>`;
  }).join('');
}

export function navbar({ site, active }) {
  return `
<header class="topbar" data-topbar>
  <div class="topbar-inner">
    <a href="index.html" class="brand" aria-label="${esc(site.nom)} — accueil">
      <img src="images/logo1.webp" alt="" width="434" height="448" class="brand-logo" decoding="async">
    </a>

    <nav class="nav-desktop" aria-label="Navigation principale">
      <ul class="nav-list" role="list">${navLinks(active)}</ul>
    </nav>

    <a class="nav-cta" href="${safeUrl(site.lienReservation)}" target="_blank" rel="noopener">Réserver</a>

    <input class="nav-toggle" type="checkbox" id="nav-toggle" aria-hidden="true" tabindex="-1">
    <label class="burger" for="nav-toggle" role="button" tabindex="0" aria-label="Ouvrir le menu" aria-controls="menu-mobile" aria-expanded="false" data-burger>
      <span></span><span></span><span></span>
    </label>

    <nav class="nav-mobile" id="menu-mobile" aria-label="Navigation mobile">
      <ul class="nav-list nav-list--mobile" role="list">${navLinks(active)}
        <li class="nav-list-cta"><a href="${safeUrl(site.lienReservation)}" target="_blank" rel="noopener">Réserver une séance</a></li>
      </ul>
    </nav>
    <label class="nav-overlay" for="nav-toggle" aria-hidden="true"></label>
  </div>
</header>`;
}

export function footer({ site, year }) {
  const tel = site.telephone ? site.telephone.replace(/\D/g, '') : '';
  const telHref = tel ? `tel:+33${tel.replace(/^0/, '')}` : '';
  return `
<footer class="footer">
  <div class="footer-inner">
    <div class="footer-grid">
      <div class="footer-brand">
        <img src="images/logo2.webp" alt="" width="120" height="132" loading="lazy" decoding="async">
        <p class="footer-tagline">${esc(site.slogan)}</p>
      </div>

      <nav class="footer-nav" aria-label="Plan du site">
        <h2>Le site</h2>
        <ul role="list">${navLinks(null)}</ul>
      </nav>

      <div class="footer-contact">
        <h2>Contact</h2>
        <ul role="list">
          <li><a href="mailto:${esc(site.email)}">${esc(site.email)}</a></li>
          ${telHref ? `<li><a href="${telHref}">${esc(site.telephone)}</a></li>` : ''}
          <li>${esc(site.zone)}</li>
          <li><a href="${safeUrl(site.lienReservation)}" target="_blank" rel="noopener">Réserver en ligne</a></li>
          ${site.instagram ? `<li><a href="${safeUrl(site.instagram)}" target="_blank" rel="noopener">Instagram</a></li>` : ''}
          ${site.facebook ? `<li><a href="${safeUrl(site.facebook)}" target="_blank" rel="noopener">Facebook</a></li>` : ''}
        </ul>
      </div>
    </div>

    <p class="footer-seo">${esc(site.texteSeoLocal)}</p>

    <div class="footer-bottom">
      <span>© ${year} ${esc(site.nom)} — Tous droits réservés</span>
      <span><a href="mentions-legales.html">Mentions légales</a> · <a href="politiques-de-confidentialites.html">Politique de confidentialité</a></span>
    </div>
  </div>
</footer>`;
}

/**
 * Enveloppe une page complète.
 * page: { title, description, path, active, bodyClass, ogImage, jsonLd: [], noindex }
 */
export function layout({ site, page, body, year = new Date().getFullYear() }) {
  const canonical = `${site.url.replace(/\/$/, '')}/${page.path === 'index.html' ? '' : page.path}`;
  const ogImage = `${site.url.replace(/\/$/, '')}/${page.ogImage || 'images/og-image.jpg'}`;
  const ld = (page.jsonLd || []).map((o) => `<script type="application/ld+json">${jsonLd(o)}</script>`).join('\n');
  const fullTitle = page.title ? `${page.title} — ${site.nom}` : site.nom;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(fullTitle)}</title>
  <meta name="description" content="${esc(page.description || site.descriptionSeo)}">
  ${page.noindex ? '<meta name="robots" content="noindex, nofollow">' : ''}
  <link rel="canonical" href="${esc(canonical)}">
  <meta name="theme-color" content="#faf3f3">

  <meta property="og:type" content="website">
  <meta property="og:site_name" content="${esc(site.nom)}">
  <meta property="og:locale" content="fr_FR">
  <meta property="og:title" content="${esc(fullTitle)}">
  <meta property="og:description" content="${esc(page.description || site.descriptionSeo)}">
  <meta property="og:url" content="${esc(canonical)}">
  <meta property="og:image" content="${esc(ogImage)}">
  <meta name="twitter:card" content="summary_large_image">

  <link rel="icon" href="favicon.ico" sizes="any">
  <link rel="icon" href="icons/icon-192.png" type="image/png" sizes="192x192">
  <link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
  <link rel="manifest" href="site.webmanifest">

  <link rel="preload" href="fonts/marcellus-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="fonts/manrope-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="css/fonts.css">
  <link rel="stylesheet" href="css/style.css">
  ${ld}
</head>
<body class="${esc(page.bodyClass || '')}">
<a class="skip-link" href="#contenu">Aller au contenu</a>
<div class="backdrop" aria-hidden="true"></div>
${navbar({ site, active: page.active })}
<main id="contenu">
${body}
</main>
${footer({ site, year })}
<script src="js/site.js" defer></script>
</body>
</html>
`;
}
