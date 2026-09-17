# Raccourci iPhone — TCV - Vérifier contacts

## Version rapide recommandée

TCV Assistant envoie maintenant une simple liste de numéros, **un numéro par ligne**, par exemple :

```text
0782565405
0612345678
0698765432
```

Il ne faut plus convertir l'entrée en dictionnaire.

L'objectif est aussi d'éviter la méthode lente qui faisait **une recherche Contacts pour chaque joueur**. Avec 100+ joueurs, cette méthode peut chauffer l'iPhone et devenir instable.

## Principe

1. Recevoir `Entrée de raccourci` en texte.
2. Charger les Contacts **une seule fois**.
3. Récupérer tous leurs numéros de téléphone.
4. Pour chaque numéro de contact, ne garder que les chiffres.
5. Comparer ses 9 derniers chiffres avec le texte reçu depuis TCV Assistant.
6. Si le numéro est présent dans la liste TCV, ajouter une version `0xxxxxxxxx` à la variable `Numéros trouvés`.
7. À la fin, combiner `Numéros trouvés` avec des sauts de ligne.
8. Utiliser `Arrêter ce raccourci et produire un résultat`.
9. Si rien n'a été trouvé, retourner exactement `NONE`.

## Structure conseillée dans Raccourcis

```text
Entrée de raccourci

Rechercher des contacts
  → aucun filtre
  → limite désactivée

Obtenir les détails des contacts
  → Numéros de téléphone

Répéter avec chaque élément dans Numéros de téléphone

    Remplacer le texte
      motif : [^0-9]
      par : [vide]
      dans : Élément de répétition
      Expression régulière : activée

    Faire correspondre le texte
      motif : [0-9]{9}$
      dans : Texte remplacé

    Si Entrée de raccourci contient Correspondances

        Texte
          0[Correspondances]

        Ajouter à la variable
          Numéros trouvés

    Fin de Si

Fin de la récurrence

Si Numéros trouvés a une valeur
    Combiner Numéros trouvés avec Nouvelle ligne
    Arrêter ce raccourci et produire un résultat [Texte combiné]
Sinon
    Texte NONE
    Arrêter ce raccourci et produire un résultat [NONE]
Fin de Si
```

## Important

- Ne pas utiliser `Obtenir le dictionnaire de Entrée de raccourci` dans cette nouvelle version.
- Ne pas utiliser `Rechercher des contacts` à l'intérieur de la boucle des joueurs.
- `Rechercher des contacts` doit être exécuté **une seule fois**.
- Pour un gros fichier, cette version est beaucoup plus légère car elle parcourt la base Contacts une seule fois au lieu de lancer 100+ recherches séparées.
