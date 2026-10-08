import { esc } from '../lib/html.js';
import { layout } from '../partials/layout.js';

function telHref(site) {
  const tel = site.telephone ? site.telephone.replace(/\D/g, '') : '';
  return tel ? `tel:+33${tel.replace(/^0/, '')}` : '';
}

export function renderMentions({ site }) {
  const body = `
<header class="page-head page-head--compact">
  <h1 class="page-title">Mentions légales</h1>
  <p class="lead">Transparence, respect et protection des données</p>
</header>

<section class="legal" aria-label="Mentions légales">
  <article class="legal-card">
    <h2>1. Éditeur du site</h2>
    <p><strong>Dénomination :</strong> ${esc(site.nom)}</p>
    <p><strong>Statut juridique :</strong> Micro-entreprise / auto-entrepreneur</p>
    ${site.siret ? `<p><strong>SIRET :</strong> ${esc(site.siret)}</p>` : ''}
    ${site.responsablePublication ? `<p><strong>Responsable de la publication :</strong> ${esc(site.responsablePublication)}</p>` : ''}
    <p><strong>Adresse :</strong> ${esc(site.adresse?.codePostal)} ${esc(site.adresse?.ville)} — France</p>
    ${site.telephone ? `<p><strong>Téléphone :</strong> <a href="${telHref(site)}">${esc(site.telephone)}</a></p>` : ''}
    <p><strong>E-mail :</strong> <a href="mailto:${esc(site.email)}">${esc(site.email)}</a></p>
  </article>

  <article class="legal-card">
    <h2>2. Hébergement du site</h2>
    <p>Le site est hébergé par <strong>GitHub Pages — GitHub, Inc.</strong>, 88 Colin P. Kelly Jr. St., San Francisco, CA 94107, États-Unis.</p>
    <p><a href="https://pages.github.com/" target="_blank" rel="noopener noreferrer">https://pages.github.com/</a></p>
  </article>

  <article class="legal-card">
    <h2>3. Propriété intellectuelle</h2>
    <p>L’ensemble des contenus présents sur ce site — textes, images, illustrations, logo, graphismes, vidéos, éléments visuels, sons, créations et mise en forme — est protégé par le droit d’auteur et les règles relatives à la propriété intellectuelle.</p>
    <p>Toute reproduction, représentation, modification, publication, adaptation, distribution ou exploitation, totale ou partielle, de ces éléments, sans autorisation écrite préalable de ${esc(site.nom)}, est strictement interdite.</p>
  </article>

  <article class="legal-card">
    <h2>4. Limitation de responsabilité</h2>
    <p>${esc(site.nom)} s’efforce de fournir des informations fiables, claires et régulièrement mises à jour. Toutefois, aucune garantie n’est donnée quant à l’exactitude, l’exhaustivité ou l’actualité des contenus diffusés.</p>
    <p>L’utilisateur reconnaît utiliser les informations présentes sur ce site sous sa responsabilité exclusive.</p>
    <p>Les prestations proposées par ${esc(site.nom)} relèvent de l’accompagnement bien-être. Elles ne remplacent en aucun cas un avis, un diagnostic, un traitement ou un suivi médical, psychologique ou vétérinaire.</p>
  </article>

  <article class="legal-card">
    <h2>5. Protection des données personnelles</h2>
    <p>Les données personnelles collectées via le site sont traitées conformément au Règlement Général sur la Protection des Données (RGPD) et à la législation française en vigueur.</p>
    <p>Vous disposez notamment d’un droit d’accès, de rectification, d’opposition, de limitation et de suppression concernant vos données personnelles.</p>
    <p>Pour exercer vos droits, vous pouvez écrire à : <a href="mailto:${esc(site.email)}">${esc(site.email)}</a></p>
    <p>Pour en savoir davantage, consultez la <a href="politiques-de-confidentialites.html">politique de confidentialité</a>.</p>
  </article>

  <article class="legal-card">
    <h2>6. Liens externes</h2>
    <p>Le site peut contenir des liens vers des sites externes, notamment des plateformes de réservation ou des réseaux sociaux. ${esc(site.nom)} ne peut être tenue responsable du contenu, du fonctionnement ou de la politique de confidentialité de ces sites tiers.</p>
  </article>

  <article class="legal-card">
    <h2>7. Droit applicable</h2>
    <p>Les présentes mentions légales sont régies par le droit français.</p>
    <p>En cas de litige, et en l’absence de résolution amiable, les juridictions françaises compétentes seront saisies conformément aux règles de droit commun.</p>
  </article>
</section>
`;
  return layout({
    site,
    page: {
      title: 'Mentions légales',
      description: `Mentions légales du site ${site.nom} : éditeur, hébergement, propriété intellectuelle, responsabilité, données personnelles et droit applicable.`,
      path: 'mentions-legales.html',
      active: null,
      bodyClass: 'page-legal',
    },
    body,
  });
}

export function renderConfidentialite({ site }) {
  const body = `
<header class="page-head page-head--compact">
  <h1 class="page-title">Politique de confidentialité</h1>
  <p class="lead">Respect, transparence et confidentialité</p>
</header>

<section class="legal" aria-label="Politique de confidentialité">
  <article class="legal-card">
    <h2>Protection de vos données</h2>
    <p>Chez ${esc(site.nom)}, la protection et la confidentialité de vos données personnelles sont essentielles. Elles sont traitées avec respect, discrétion, sécurité et transparence.</p>
  </article>

  <article class="legal-card">
    <h2>1. Données collectées</h2>
    <p>Les informations susceptibles d’être recueillies sont :</p>
    <ul class="legal-list">
      <li>Prénom</li>
      <li>Adresse e-mail</li>
      <li>Numéro de téléphone</li>
      <li>Informations partagées volontairement dans le cadre d’un soin, d’un échange ou d’un accompagnement</li>
    </ul>
    <p>Aucune donnée bancaire n’est conservée par ${esc(site.nom)}.</p>
  </article>

  <article class="legal-card">
    <h2>2. Utilisation des données</h2>
    <p>Vos données sont utilisées uniquement pour :</p>
    <ul class="legal-list">
      <li>Gérer les rendez-vous et les échanges</li>
      <li>Répondre à vos demandes de contact</li>
      <li>Adapter l’accompagnement à vos besoins spécifiques</li>
      <li>Vous envoyer, si vous y consentez, des informations inspirantes ou pratiques liées aux activités de ${esc(site.nom)}</li>
    </ul>
  </article>

  <article class="legal-card">
    <h2>3. Confidentialité des séances</h2>
    <p>Tout ce qui est partagé lors d’un soin ou d’un accompagnement reste strictement confidentiel.</p>
    <p>Aucune information personnelle ne sera vendue, cédée ou transmise à des tiers sans votre accord explicite, sauf obligation légale.</p>
  </article>

  <article class="legal-card">
    <h2>4. Conservation des données</h2>
    <p>Vos données sont conservées de manière sécurisée et uniquement pendant la durée nécessaire à leur utilisation.</p>
    <p>Vous pouvez demander leur modification ou leur suppression à tout moment.</p>
  </article>

  <article class="legal-card">
    <h2>5. Vos droits</h2>
    <p>Conformément à la réglementation en vigueur, vous disposez notamment des droits suivants :</p>
    <ul class="legal-list">
      <li>Droit d’accès à vos données</li>
      <li>Droit de rectification</li>
      <li>Droit de suppression</li>
      <li>Droit d’opposition</li>
      <li>Droit à la limitation du traitement</li>
    </ul>
    <p>Pour toute demande, vous pouvez écrire à : <a href="mailto:${esc(site.email)}">${esc(site.email)}</a></p>
  </article>

  <article class="legal-card">
    <h2>6. Cookies</h2>
    <p>Ce site n’utilise aucun cookie de suivi ni de publicité, et ne charge aucune ressource depuis un service tiers (les polices de caractères sont hébergées sur le site). Seule la plateforme de réservation, accessible par lien, dispose de sa propre politique de confidentialité.</p>
  </article>

  <article class="legal-card">
    <h2>7. Modification de la politique</h2>
    <p>Cette politique de confidentialité peut être modifiée afin de rester conforme aux évolutions légales ou techniques du site.</p>
  </article>
</section>
`;
  return layout({
    site,
    page: {
      title: 'Politique de confidentialité',
      description: `Politique de confidentialité de ${site.nom} : données collectées, utilisation, conservation, droits et cookies.`,
      path: 'politiques-de-confidentialites.html',
      active: null,
      bodyClass: 'page-legal',
    },
    body,
  });
}

export function renderNotFound({ site }) {
  const body = `
<header class="page-head page-head--compact">
  <h1 class="page-title">Page introuvable</h1>
  <p class="lead">Cette page n’existe pas ou a changé d’adresse.</p>
  <div class="hero-actions">
    <a class="btn btn-primary" href="/">Retour à l’accueil</a>
    <a class="btn btn-ghost" href="/prestations.html">Voir les prestations</a>
  </div>
</header>
`;
  return layout({
    site,
    page: {
      title: 'Page introuvable',
      description: 'Page introuvable.',
      path: '404.html',
      active: null,
      bodyClass: 'page-legal page-404',
      noindex: true,
    },
    body,
  }).replace(/(href|src)="(?!https?:|mailto:|tel:|\/|#)/g, '$1="/');
}
