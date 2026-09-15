# TCV Tournament Assistant — PWA V1

Cette version est une **Progressive Web App** : elle s'installe depuis Safari sur l'écran d'accueil de l'iPhone, sans App Store, sans Mac et sans certificat de 7 jours.

## Fonctionnalités incluses

- Design TC Vitrolles.
- Installation en tant que web app iPhone.
- Fonctionnement local après le premier chargement.
- Import direct des fichiers Excel MOJA `.xls` et `.xlsx`.
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

## Import MOJA

Utilisez directement le fichier Excel exporté depuis MOJA au format `.xls` ou `.xlsx`.

Le fichier doit contenir au minimum :

- Nom
- Téléphone

Colonnes reconnues lorsqu'elles sont présentes :

- Nom
- Prénom
- Téléphone / Tel / Portable / Mobile
- Date de naissance
- Année de naissance
- Sexe / Genre
- Classement
- Club
- Catégorie

Le lecteur Excel utilisé dans le navigateur prend en charge le format historique `.xls` ainsi que `.xlsx`.

> Lors de la première utilisation de l'import Excel, une connexion Internet est nécessaire pour charger le lecteur Excel. Les données joueurs restent ensuite stockées localement dans la PWA.

## Installer sur iPhone

1. Ouvrir l'adresse GitHub Pages dans **Safari**.
2. Appuyer sur **Partager**.
3. Choisir **Sur l'écran d'accueil**.
4. Appuyer sur **Ajouter**.
5. L'icône TCV apparaît sur l'écran d'accueil.

Il n'y a **aucune expiration de 7 jours**.

## Limites actuelles

- La PWA ne peut pas lire automatiquement tout le carnet Contacts de l'iPhone.
- Le pont Contacts / Messages est effectué avec l'application Raccourcis.
- Google Sheets n'est pas encore synchronisé : prévu pour la V2.
- Les données sont stockées localement sur l'appareil tant que la synchronisation cloud n'est pas ajoutée.

## Prochaine étape — V2

- Synchronisation Google Sheets.
- Sauvegarde / récupération de la base joueurs.
- Mise à jour bidirectionnelle.
- Gestion des campagnes persistantes.
- Filtres supplémentaires : classement, catégorie FFT, club.
- Détection plus avancée des doublons.
