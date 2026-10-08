/** Données structurées (schema.org) générées depuis content/site.json. */

export function localBusiness(site) {
  const base = site.url.replace(/\/$/, '');
  const tel = site.telephone ? '+33' + site.telephone.replace(/\D/g, '').replace(/^0/, '') : undefined;
  return {
    '@context': 'https://schema.org',
    '@type': 'HealthAndBeautyBusiness',
    '@id': `${base}/#organisation`,
    name: site.nom,
    description: site.descriptionSeo,
    url: base,
    email: site.email,
    telephone: tel,
    image: `${base}/images/og-image.jpg`,
    logo: `${base}/images/logo1.webp`,
    address: {
      '@type': 'PostalAddress',
      postalCode: site.adresse?.codePostal,
      addressLocality: site.adresse?.ville,
      addressRegion: site.adresse?.departement,
      addressCountry: site.adresse?.pays || 'FR',
    },
    areaServed: ['Lizos', 'Tarbes', 'Lourdes', 'Bagnères-de-Bigorre', 'Hautes-Pyrénées'],
    sameAs: [site.instagram, site.facebook, site.lienReservation].filter(Boolean),
  };
}

export function breadcrumb(site, items) {
  const base = site.url.replace(/\/$/, '');
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: `${base}/${it.path === 'index.html' ? '' : it.path}`,
    })),
  };
}

export function serviceList(site, prestations) {
  const base = site.url.replace(/\/$/, '');
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Prestations',
    itemListElement: prestations.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Service',
        name: p.titre,
        description: p.sousTitre || p.description,
        url: `${base}/prestations.html#${p.id}`,
        provider: { '@id': `${base}/#organisation` },
        ...(p.prix ? { offers: { '@type': 'Offer', price: String(p.prix).replace(/[^\d.,]/g, '').replace(',', '.'), priceCurrency: 'EUR' } } : {}),
      },
    })),
  };
}

export function courseList(site, formations) {
  const base = site.url.replace(/\/$/, '');
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Initiations',
    itemListElement: formations.map((f, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Course',
        name: f.titre,
        description: f.sousTitre,
        url: `${base}/formations.html#${f.id}`,
        provider: { '@id': `${base}/#organisation` },
      },
    })),
  };
}
