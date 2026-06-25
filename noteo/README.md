# Mode d'emploi — Noteo

## Présentation

**Noteo** est une application web autonome (un seul fichier HTML) qui permet de corriger des copies numérisées au format PDF. Elle fonctionne entièrement dans votre navigateur, sans serveur ni connexion internet requise après le premier chargement.

---

## 1. Démarrage

### Première utilisation

À l'ouverture du fichier, la fenêtre de **création de session** s'affiche automatiquement. Remplissez :

| Champ | Description |
|---|---|
| **Matière** | Ex : Mathématiques |
| **Classe** | Ex : Terminale B |
| **Note sur** | Barème global (ex : 20) |
| **Pages par élève** | Nombre de pages par copie (peut être ajusté après chargement du PDF) |

Cliquez sur **Créer la session** pour valider, ou sur **Annuler** pour revenir à la session précédente (si une session existe déjà).

### Importer un modèle de session

Plutôt que de tout saisir manuellement, vous pouvez :

1. Cliquer sur l'icône **↓** (en haut à droite de la fenêtre) pour télécharger un modèle `.txt`
2. Remplir ce fichier texte avec vos informations
3. Cliquer sur l'icône **↑** pour l'importer — tous les champs sont remplis automatiquement

**Format du fichier modèle :**

```
MATIERE: Mathématiques
CLASSE: Terminale B
NOTE_SUR: 20
PAGES_PAR_ELEVE: 2

EXERCICE: Exercice 1
QUESTION: Q1 ; 4
QUESTION: Q2 ; 3

ELEVE: Dupont Alice
ELEVE: Martin Lucas
```

### Restaurer une session existante

Au démarrage, si une session a été précédemment sauvegardée dans le navigateur, une confirmation est demandée pour la restaurer automatiquement.

---

## 2. Définir le barème

Le barème est structuré en **exercices** contenant des **questions**. Dans la fenêtre de session :

- Cliquez sur **+ Ajouter un exercice** pour créer un exercice
- Pour chaque exercice, saisissez les questions avec leur nom et leur nombre de points
- Cliquez sur la corbeille pour supprimer un exercice ou une question

### Modifier le barème après création

Dans le panneau droit (onglet **Corriger**), cliquez sur l'icône **✏** à droite du titre "Barème" pour ouvrir l'éditeur. Les notes déjà saisies sont conservées si la question (même nom, même maximum) existe toujours dans le nouveau barème.

---

## 3. Saisir la liste des élèves

Dans la fenêtre de session, saisissez les noms dans la zone texte, **un élève par ligne**.

### Modifier la liste après création

Cliquez sur l'icône **✏** en haut de la liste des élèves (sidebar gauche) pour ouvrir l'éditeur. Les notes et annotations des élèves dont le nom est inchangé sont préservées.

> **Astuce :** Les élèves peuvent être réordonnés par **glisser-déposer** grâce à la poignée ⠿ à gauche de chaque nom dans la liste.

---

## 4. Charger le PDF des copies

Toutes les copies doivent être regroupées dans **un seul fichier PDF**. Cliquez sur **Choisir un fichier** dans la zone centrale pour l'importer.

La zone d'upload affiche au préalable le nombre de pages attendues selon les paramètres de la session.

### Assigner les pages par élève

Cliquez sur le bouton **Pages** dans la barre de navigation pour ouvrir la fenêtre d'assignation :

- Modifiez le **nombre de pages par élève** en haut de la fenêtre pour recalculer automatiquement
- Ajustez manuellement les colonnes **de** / **à** pour chaque élève si les copies ont des longueurs différentes
- Cliquez sur **Recalculer tout** pour redistribuer automatiquement à partir du nombre de pages par élève
- Validez avec le bouton **Valider**

---

## 5. Corriger une copie

### Navigation entre élèves

- Cliquez sur un **élève dans la liste** à gauche pour afficher sa copie
- Utilisez les boutons **↑ ↓ élève** dans la barre de navigation violette
- En naviguant **page par page** (boutons ◀ ▶), l'élève correspondant est sélectionné automatiquement

### Saisir les notes

Dans le panneau de droite (onglet **Corriger**) :

1. Les exercices sont **repliables** — cliquez sur l'en-tête pour les déplier/replier. Le sous-total de l'exercice reste visible même replié.
2. Cliquez sur le **champ de note** d'une question pour ouvrir un menu déroulant proposant toutes les valeurs possibles **par quart de point** (0, 0.25, 0.5… jusqu'au maximum), ainsi que l'option **Non traité** (comptée comme 0).
3. La **note finale** se calcule et s'affiche automatiquement avec une barre de progression.
4. Si une note **dépasse le maximum autorisé**, le champ passe en rouge et la mention **"Note impossible"** apparaît.

### Rédiger une appréciation

Le champ **Appréciation** permet d'écrire un commentaire général sur la copie de l'élève.

---

## 6. Annoter les copies

Cliquez sur le bouton **Annoter** dans la barre de navigation pour ouvrir la barre d'outils d'annotation.

### Outils disponibles

| Outil | Description |
|---|---|
| **Sélection** | Cliquer sur une annotation pour la sélectionner, la déplacer ou la supprimer |
| **Dessin** | Tracer à main levée sur la copie en maintenant le clic |
| **Trait** | Cliquer-glisser pour tracer un segment droit |
| **Texte** | Cliquer sur la copie pour placer un texte (`Entrée` pour valider, `Maj+Entrée` pour sauter une ligne, `Échap` pour annuler) |

### Options

- **Couleur** : 5 couleurs prédéfinies (rouge, violet, vert, orange, noir) + sélecteur de couleur personnalisée
- **Taille** : épaisseur du trait ou taille du texte

### Gérer les annotations

- Les annotations s'affichent dans l'onglet **Annotations** du panneau droit, avec la page et le type
- Cliquer sur une annotation dans la liste la sélectionne sur la copie (cadre pointillé bleu)
- En mode **Sélection**, cliquer sur le bouton rouge ✕ de la sélection supprime l'annotation
- Cliquer sur ✕ dans la liste du panneau supprime également l'annotation

> Les annotations sont liées à chaque élève et à chaque page. Elles sont sauvegardées avec la session.

---

## 7. Navigation dans le PDF

La barre de navigation contient (de gauche à droite) :

| Élément | Fonction |
|---|---|
| **↑ ↓ élève** | Passer à l'élève précédent / suivant — affiche toutes ses pages |
| **Nom / pages** | Affiche l'élève courant et les numéros de ses pages |
| **◀ ▶ page** | Avancer / reculer d'une page dans le PDF entier |
| **Champ numérique / total** | Saisir un numéro de page pour y accéder directement |
| **− + % ↺** | Dézoomer, zoomer, afficher le pourcentage, réinitialiser à 130% |
| **Annoter** | Ouvrir/fermer la barre d'outils d'annotation |
| **Pages** | Ouvrir la fenêtre d'assignation des pages par élève |
| **Exporter PDF** | Télécharger le PDF avec les annotations (visible après chargement) |

> Toutes les pages d'une copie s'affichent **verticalement** — faites défiler vers le bas pour voir la suite.

---

## 8. Statistiques

L'onglet **Stats** du panneau droit affiche en temps réel :

- **Moyenne** et **médiane** de la classe
- **Note maximale** et **note minimale**
- **Distribution** des notes par tranche (0–5, 5–8, 8–10, 10–12, 12–14, 14–16, 16–20)

---

## 9. Sauvegarde et restauration

### Sauvegarde automatique (localStorage)

Noteo sauvegarde automatiquement la session dans le **stockage local du navigateur** après chaque modification (notes, annotations, appréciations…). Un indicateur vert **"Sauvegardé"** s'affiche brièvement dans la barre du haut.

> ⚠ La sauvegarde automatique est liée au navigateur et au fichier HTML. Vider le cache ou changer de navigateur efface la sauvegarde.

### Sauvegarde manuelle (JSON)

Cliquez sur l'icône **💾** dans la barre du haut pour télécharger un fichier `.json` complet contenant toutes les données de la session : barème, élèves, notes, appréciations et annotations dessinées.

> Le fichier PDF n'est **pas inclus** dans le JSON. Il faudra le recharger manuellement après restauration.

### Charger une session sauvegardée

Cliquez sur l'icône **📂** dans la barre du haut pour importer un fichier `.json` précédemment exporté. La session est restaurée intégralement.

---

## 10. Exports

### Export CSV

Cliquez sur **Export CSV** dans la barre du haut pour télécharger un tableau compatible Excel avec :

- Le nom de chaque élève
- Les notes par question (ex : *Exercice 1 – Q1*), avec **NT** pour les questions non traitées
- Le total et la note maximale
- L'appréciation

### Export PDF annoté

Cliquez sur **Exporter PDF** (bouton vert, barre de navigation) pour télécharger le PDF original avec toutes les annotations intégrées. L'export traite toutes les pages du PDF.

> L'export peut prendre quelques secondes selon la taille du PDF.

---

## 11. Modifier une session existante

### Modifier la matière et la classe

Cliquez sur le **titre** dans la barre du haut (ou sur l'icône ✏ à côté), modifiez les champs, puis appuyez sur `Entrée` ou cliquez sur ✓. Appuyez sur `Échap` pour annuler.

### Modifier le barème

Cliquez sur l'icône **✏** dans le titre "Barème" du panneau droit.

### Modifier la liste des élèves

Cliquez sur l'icône **✏** dans l'en-tête de la sidebar gauche.

### Créer une nouvelle session

Cliquez sur **+ Session** dans la barre du haut. Un bouton **Annuler** permet de revenir à la session en cours si on s'est trompé.

---

## Raccourcis utiles

| Action | Méthode |
|---|---|
| Valider un texte annoté | `Entrée` |
| Retour à la ligne (texte annoté) | `Maj + Entrée` |
| Annuler un texte annoté | `Échap` |
| Valider la modification du titre | `Entrée` |
| Annuler la modification du titre | `Échap` |
| Réordonner les élèves | Glisser-déposer avec ⠿ |
