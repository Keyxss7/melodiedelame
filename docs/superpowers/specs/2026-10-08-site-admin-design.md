# Mélodie de l’Âme — refonte du site + admin mobile (design validé le 2026-10-08)

## Objectif
Site vitrine (sonothérapie, Lizos/Tarbes) hébergé sur GitHub Pages. Deux besoins :
1. remettre le site au niveau pro en **gardant l’identité visuelle** (doré, rose poudré, verre dépoli,
   Marcellus / Manrope / Dancing Script / Alex Brush) ;
2. permettre au propriétaire, **seul, depuis son téléphone, sans toucher au code et sans serveur**,
   de gérer prestations, initiations, prix/durée et textes de la page d’accueil.

## Décisions
- **Admin = page statique `/admin/` + API GitHub** avec un jeton fine-grained limité au dépôt,
  stocké uniquement sur le téléphone. Pas de Decap CMS (proxy OAuth nécessaire), pas de backend tiers.
- **Génération statique par GitHub Actions** (`node build.js`, zéro dépendance) à partir de
  `content/*.json`. HTML pur en sortie : SEO local et performance optimaux, navbar/footer écrits une fois.
- **Polices auto-hébergées** (plus de requête vers Google Fonts : perf + RGPD).
- **Images converties en WebP** (16 Mo → < 2 Mo) ; photos ajoutées via l’admin compressées côté téléphone.

## Modèle de contenu
- `site.json` : nom, slogan, email, téléphone, lien de réservation, adresse, zone, horaires, descriptionSeo, texteSeoLocal, réseaux, siret.
- `accueil.json` : hero, sections[] (kicker, titre, lead, puces, image, paragraphes, encadré, paragraphesApres), apercuSoins, apercuInitiations, contact, citation.
- `prestations.json` : intro, motPerso, rappel, items[] (id, titre, sousTitre, description, image, benefices, duree, prix, lienReservation, visible).
- `formations.json` : intro, esprit, certification, items[] (id, titre, sousTitre, image, blocs[{titre, points}], note, duree, prix, prochainesDates, visible).

## Flux de publication
Admin → commit `content/*.json` (+ photo dans `src/images/uploads/`) → Actions : tests + build → déploiement Pages.
Un build en échec ne touche pas au site en ligne. L’admin interroge l’état du workflow pour afficher « En ligne ✓ ».

## Robustesse admin
Relecture du JSON avant chaque écriture (sha), 3 tentatives en cas de conflit ; photo envoyée avant le JSON ;
brouillons locaux ; validation des champs obligatoires ; échappement HTML de tout le contenu au build.

## Vérification
- `tests/*.test.js` : helpers, build complet, masquage, échappement, contenu invalide, sitemap.
- `tests/admin.e2e.py` : parcours complet de l’admin contre une API GitHub simulée (Playwright).
- Captures desktop/mobile des trois pages et de l’admin.
