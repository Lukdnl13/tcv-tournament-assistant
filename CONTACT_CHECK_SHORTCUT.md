# Raccourci iPhone — TCV - Vérifier contacts

Ce raccourci reçoit depuis la PWA un JSON contenant les joueurs à vérifier :

```json
[
  {"id":"...","firstName":"Lucas","lastName":"DANIEL","phone":"+33782565405","category":"Senior"}
]
```

Le raccourci doit rechercher chaque numéro dans Contacts et retourner un JSON texte de la forme :

```json
[
  {"id":"...","exists":true},
  {"id":"...","exists":false}
]
```

## Logique à construire dans Raccourcis

1. Recevoir l'entrée du raccourci en texte.
2. Utiliser **Obtenir le dictionnaire à partir de l'entrée** / l'action de décodage JSON disponible sur iOS.
3. Répéter pour chaque élément de la liste.
4. Récupérer `phone` et `id`.
5. Utiliser **Rechercher des contacts** en filtrant sur le numéro de téléphone.
6. Tester si au moins un contact a été trouvé.
7. Ajouter à une liste résultat un dictionnaire avec `id` et `exists` (`true` ou `false`).
8. À la fin, convertir la liste résultat en JSON/texte.
9. Faire de ce texte la sortie finale du raccourci.

Nom exact du raccourci :

`TCV - Vérifier contacts`

La PWA utilise x-callback-url : à la fin du raccourci, iOS revient automatiquement dans TCV Tournament Assistant avec le résultat, puis l'application affiche `✓ Contact` ou `À créer`.
