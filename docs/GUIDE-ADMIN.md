# Guide de mise en route

Les étapes 1 et 2 (mise en ligne du nouveau site, bascule de GitHub Pages) sont faites.
Il reste, une seule fois : créer le jeton (étape 3) et installer l’admin sur ton téléphone (étape 4).

---

## 1. Le nouveau site est en ligne ✓ (fait le 8 octobre 2026)

- Le dépôt `Keyxss7/melodiedelame` contient le nouveau projet, les anciens fichiers ont été retirés.
- Le workflow `.github/workflows/deploy.yml` est en place (une copie de référence reste dans `docs/deploy.yml`).
- GitHub Pages est configuré sur la source **GitHub Actions** ; le premier déploiement a réussi.
- Ton clone local est dans `Desktop\melodiedelame-main\repo` (ouvert dans GitHub Desktop). C'est là qu'il faut
  travailler désormais ; le reste du dossier `melodiedelame-main` peut être supprimé.

Pour une modification depuis le PC : édite dans `repo`, puis dans un terminal :

```bash
node build.js        # vérifie que tout se génère (dist/)
npm test             # 11 tests doivent passer
```

puis commit + push (GitHub Desktop ou `git`). La publication est automatique (≈ 1 min, onglet **Actions**).

## 2. GitHub Pages ✓

Déjà fait : **Settings → Pages → Source : GitHub Actions**. Rien à toucher.

## 3. Créer le jeton d’accès (≈ 2 min)

Sur GitHub (PC ou téléphone), menu de ton profil → **Settings** :

1. **Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**
2. *Token name* : `Admin site` — *Expiration* : **1 an** (maximum proposé ; GitHub impose une date).
3. *Repository access* : **Only select repositories** → coche le dépôt du site.
4. *Permissions → Repository permissions* :
   - **Contents : Read and write** (obligatoire — c’est ce qui permet d’écrire le contenu)
   - **Actions : Read-only** (facultatif — permet à l’admin d’afficher « Site en ligne ✓ »)
   - rien d’autre (Metadata est ajouté automatiquement).
5. **Generate token**, puis copie-le (il commence par `github_pat_`). Il n’est affiché qu’une fois.

> Ce jeton ne donne accès **qu’à ce dépôt**, et seulement à son contenu. Il ne permet ni de
> toucher à ton compte, ni aux autres dépôts. Quand il expire, l’admin te prévient deux
> semaines avant : tu en génères un nouveau et tu te reconnectes.

## 4. Installer l’admin sur le téléphone

1. Ouvre **https://melodiedelame.fr/admin/** dans Safari (iPhone) ou Chrome (Android).
2. Renseigne le dépôt (`ton-utilisateur/nom-du-depot`), la branche (`main`), colle le jeton,
   et si tu veux la date d’expiration. **Se connecter.**
3. Ajoute la page à l’écran d’accueil :
   - iPhone : bouton Partager → **Sur l’écran d’accueil**
   - Android : menu ⋮ → **Ajouter à l’écran d’accueil** (ou « Installer l’application »)

L’icône « Admin Mélodie » apparaît comme une appli. Le jeton est enregistré uniquement sur ce
téléphone (dans le stockage du navigateur). « Se déconnecter » l’efface.

Pour donner l’accès à quelqu’un d’autre (Mélissa, par exemple) : même procédure sur son
téléphone, avec le même jeton — ou mieux, un jeton créé depuis son propre compte GitHub si
elle est collaboratrice du dépôt.

---

## Utiliser l’admin au quotidien

| Écran | Ce que tu peux faire |
| --- | --- |
| **Prestations / Initiations** | Ajouter, modifier, supprimer, masquer (case « Visible »), réordonner (▲▼ puis « Enregistrer le nouvel ordre »), changer la photo. |
| **Textes de la page** (lien en haut à droite de la liste) | Titre et sous-titre de la page, mot personnel, rappel, badges, blocs « esprit » / « attestation ». |
| **Page d’accueil** | Grand titre, phrase manuscrite, boutons, les 3 sections (titres, mots-clés, image, paragraphes, encadré), aperçu des soins, bandeau initiations, bloc contact, citation. |
| **Réglages du site** | E-mail, téléphone, lien de réservation, zone, horaires, description Google, texte des villes, réseaux sociaux. |

- **Photos** : choisies depuis la galerie ou l’appareil photo. Elles sont redimensionnées
  (1400 px max) et compressées sur le téléphone avant envoi (≈ 100–300 Ko).
- **Publication** : chaque « Enregistrer » crée un commit. Le bandeau en haut indique
  « Publication en cours… » puis « Site en ligne et à jour ✓ » (≈ 1 min).
- **Brouillons** : si tu quittes une fiche sans enregistrer, elle est conservée sur le
  téléphone ; au retour, un bandeau propose de la reprendre.
- **Paragraphes** : dans les grands champs texte, une ligne vide sépare deux paragraphes.

## Modifier le contenu depuis le PC

Les fichiers `content/*.json` sont lisibles à la main. Tu peux les éditer dans VS Code,
`npm run dev` pour vérifier, puis commit + push : même publication automatique.

## En cas de problème

| Symptôme | Cause probable / solution |
| --- | --- |
| « Jeton refusé » à la connexion | Jeton mal copié ou expiré → en générer un nouveau. |
| « Accès refusé » à l’enregistrement | Le jeton n’a pas la permission **Contents : Read and write** sur ce dépôt. |
| « Statut de publication indisponible » | Le jeton n’a pas **Actions : Read-only**. Sans gravité : la publication se fait quand même. |
| Bandeau rouge « La dernière publication a échoué » | Ouvre « détail » : la page GitHub Actions montre l’erreur (souvent un JSON invalide). Le site en ligne n’est pas affecté. |
| La photo n’apparaît pas dans l’admin juste après l’ajout | Normal pendant la minute de publication : l’admin la lit alors directement depuis GitHub. |
