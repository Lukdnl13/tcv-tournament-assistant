# Raccourci iPhone — TCV - Vérifier contacts

La PWA ouvre ce raccourci avec une liste JSON de joueurs contenant notamment leur `id`, leur nom et leur numéro normalisé en `+33...`.

## Sortie recommandée du raccourci

La méthode la plus simple est de renvoyer uniquement les **numéros qui existent déjà dans Contacts**, un numéro par ligne.

Exemple :

```text
+33782565405
+33612345678
```

La PWA compare ensuite cette liste avec tous les joueurs importés :

- numéro présent dans la sortie → `✓ Dans Contacts`
- numéro absent → `À créer`

Si aucun numéro n'est trouvé, retourner exactement :

```text
NONE
```

## Logique à construire dans Raccourcis

1. Nommer le raccourci exactement `TCV - Vérifier contacts`.
2. Recevoir l'entrée du raccourci en texte.
3. Convertir l'entrée JSON en liste / dictionnaire.
4. Répéter pour chaque joueur.
5. Récupérer la valeur `phone`.
6. Utiliser **Rechercher des contacts** avec le numéro de téléphone.
7. Si au moins un contact est trouvé, ajouter le numéro à une variable/liste `Numéros trouvés`.
8. À la fin :
   - si la liste est vide, utiliser le texte `NONE` ;
   - sinon, combiner `Numéros trouvés` avec un saut de ligne.
9. **Étape indispensable : ajouter l'action `Arrêter ce raccourci et produire un résultat` et lui donner ce texte comme résultat.**

Sans cette dernière action, l'iPhone revient bien vers la PWA mais ne lui transmet rien, ce qui provoque le message « le raccourci n'a retourné aucun résultat ».

## Formats également acceptés

La PWA accepte aussi un JSON de la forme :

```json
[
  {"id":"...","exists":true},
  {"id":"...","exists":false}
]
```

ou une liste JSON de numéros.
