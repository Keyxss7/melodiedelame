# Mélodie de l’Âme — site & admin

Site vitrine statique généré à partir de fichiers JSON, publié sur GitHub Pages, avec une
mini-app d’administration mobile (`/admin/`) pour modifier le contenu sans toucher au code.

```
content/            ← le contenu éditable (JSON) : site, accueil, prestations, formations
src/
  templates/        ← une fonction JS par page (index, prestations, formations, légales)
  partials/         ← layout commun : <head> SEO, navbar, footer
  lib/              ← helpers HTML + données structurées (schema.org)
  css/              ← style.css (site) + fonts.css (polices auto-hébergées)
  fonts/            ← Marcellus, Manrope, Dancing Script, Alex Brush (.woff2, licence OFL)
  js/site.js        ← menu mobile, barre de navigation au scroll
  images/           ← images du site (WebP) ; images/uploads/ = photos ajoutées via l'admin
  admin/            ← l'app d'administration (HTML/CSS/JS vanilla, API GitHub)
  static/           ← CNAME, robots.txt, favicon, icônes, manifest
build.js            ← génère dist/ (aucune dépendance npm)
tests/              ← tests du build (node --test) + test de bout en bout de l'admin (Playwright)
.github/workflows/  ← build + déploiement GitHub Pages à chaque push
```

## Commandes

| Commande | Effet |
| --- | --- |
| `npm run build` | génère le site dans `dist/` |
| `npm run dev` | génère + serveur local sur http://localhost:4173 avec rebuild automatique |
| `npm test` | lance les tests du build |

Node ≥ 20, rien à installer (`npm install` n’est pas nécessaire).

## Comment ça se publie

1. Un commit arrive sur `main` (depuis l’admin, ou depuis ton PC).
2. GitHub Actions lance `node build.js` et déploie `dist/` sur GitHub Pages (≈ 1 min).
3. Si le contenu est invalide (JSON cassé, id en double…), le build échoue et **le site en ligne reste tel quel**.

👉 Mise en route pas à pas (GitHub Pages, jeton, installation sur le téléphone) : **[docs/GUIDE-ADMIN.md](docs/GUIDE-ADMIN.md)**.

## Modifier le design

- Couleurs, typographies, espacements : jetons en haut de `src/css/style.css` (`:root`).
- Structure d’une page : `src/templates/*.js` (template literals, `esc()` pour tout texte venant du contenu).
- Navbar / footer / balises SEO : `src/partials/layout.js`.
- Après modification : `npm run dev` pour prévisualiser, puis commit → publication automatique.

## Ajouter un champ au contenu

1. Ajoute la clé dans le JSON concerné (`content/…`).
2. Affiche-la dans le template (`src/templates/…`).
3. Ajoute le champ au formulaire de l’admin (`src/admin/admin.js`, fonctions `screenEdit`, `screenAccueil`…).
4. `npm test` puis commit.
