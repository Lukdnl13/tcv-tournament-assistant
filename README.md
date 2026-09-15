# TCV Tournament Assistant — PWA V1

Cette version est une **Progressive Web App** : elle s'installe depuis Safari sur l'écran d'accueil de l'iPhone, sans App Store, sans Mac et sans certificat de 7 jours.

## Fonctionnalités incluses

- Design TC Vitrolles.
- Installation en tant que web app iPhone.
- Fonctionnement hors ligne après le premier chargement.
- Import CSV issu de MOJA.
- Reconnaissance automatique des colonnes principales.
- Normalisation des téléphones français en `+33...`.
- Détection des doublons sur le numéro de téléphone.
- Base joueurs locale dans le navigateur.
- Recherche joueurs.
- Ciblage de campagne par âge et sexe.
- Sélection / désélection des destinataires.
- Statut de contact : Non vérifié / Existe / À créer.
- Transmission JSON vers deux Raccourcis iOS :
  - `TCV - Créer contacts`
  - `TCV - Envoyer messages`
- Historique local des campagnes préparées.

## Limites de cette V1

- Import direct XLSX non inclus : exporter MOJA en CSV pour le moment.
- La PWA ne peut pas lire automatiquement tout le carnet Contacts de l'iPhone.
  Le pont Contacts est donc effectué avec l'application Raccourcis.
- Google Sheets n'est pas encore synchronisé : prévu pour la V2.
- Les données sont stockées localement sur l'appareil / navigateur. Pensez à ne pas effacer les données Safari avant l'ajout de la synchronisation cloud.

## Tester sur PC

La PWA doit être servie par HTTP/HTTPS (le service worker ne fonctionne pas correctement en ouvrant simplement `index.html`).

### Méthode Python

Dans le dossier du projet :

```bash
python -m http.server 8080
```

Puis ouvrir :

`http://localhost:8080`

## Mettre gratuitement en ligne avec GitHub Pages

1. Créer un dépôt GitHub, par exemple `tcv-tournament-assistant`.
2. Décompresser ce projet.
3. Envoyer **le contenu du dossier** à la racine du dépôt.
4. Dans GitHub : `Settings` → `Pages`.
5. Dans `Build and deployment`, sélectionner `Deploy from a branch`.
6. Choisir `main` et `/ (root)`.
7. Enregistrer.
8. GitHub affichera une adresse du type :
   `https://VOTRE-COMPTE.github.io/tcv-tournament-assistant/`

Le site sera en HTTPS, ce qui permet l'installation PWA.

## Installer sur iPhone

1. Ouvrir l'adresse GitHub Pages dans **Safari**.
2. Appuyer sur le bouton **Partager**.
3. Choisir **Sur l'écran d'accueil**.
4. Activer l'ouverture en web app si l'option est présentée.
5. Appuyer sur **Ajouter**.
6. L'icône TCV apparaît sur l'écran d'accueil.

Il n'y a **aucune expiration de 7 jours**.

## Import MOJA

Dans la V1, utilisez un CSV contenant au minimum :

- Nom
- Téléphone

Colonnes reconnues quand elles sont présentes :

- Nom
- Prénom
- Téléphone / Tel / Portable / Mobile
- Date de naissance
- Année de naissance
- Sexe / Genre
- Classement
- Club
- Catégorie

Un fichier `data/exemple-joueurs.csv` est fourni pour tester.

## Raccourci 1 — TCV - Créer contacts

Le bouton de la PWA envoie une liste JSON comme :

```json
[
  {
    "firstName": "Lucas",
    "lastName": "DUPONT",
    "phone": "+33612345611",
    "club": "TC Marseille"
  }
]
```

Créer dans l'application **Raccourcis** un raccourci nommé exactement :

`TCV - Créer contacts`

Logique souhaitée :

1. Recevoir l'entrée en tant que texte.
2. Convertir le texte JSON en objet/dictionnaire.
3. Répéter pour chaque élément de la liste.
4. Récupérer `firstName`, `lastName`, `phone`, `club`.
5. Action `Ajouter un nouveau contact`.
6. Facultatif : mettre le club dans la société ou la note.
7. Terminer la répétition.

> Pour la première version, garde une confirmation visible pendant tes tests avant d'automatiser davantage.

## Raccourci 2 — TCV - Envoyer messages

La PWA envoie :

```json
{
  "recipients": [
    {"name":"Emma MARTIN","phone":"+33612345610"},
    {"name":"Lucas DUPONT","phone":"+33612345611"}
  ],
  "message":"Bonjour..."
}
```

Créer un raccourci nommé exactement :

`TCV - Envoyer messages`

Logique recommandée :

1. Recevoir l'entrée en tant que texte.
2. Convertir le JSON en dictionnaire.
3. Récupérer `message`.
4. Récupérer `recipients`.
5. Répéter pour chaque destinataire.
6. Récupérer son `phone`.
7. Utiliser l'action `Envoyer un message` avec le texte.
8. Au début, conserver l'affichage / validation avant envoi.

Pour une communication de tournoi, privilégier **des messages individuels** plutôt qu'un groupe où les destinataires pourraient voir les numéros des autres.

## Prochaine étape — V2

- Synchronisation Google Sheets.
- Sauvegarde / récupération de la base joueurs.
- Mise à jour bidirectionnelle.
- Gestion des campagnes persistantes.
- Filtres supplémentaires : classement, catégorie FFT, club.
- Détection plus avancée des doublons.
