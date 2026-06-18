# Guide de contribution — MonSantorin

## Prérequis

Aucun outil de build nécessaire. Un simple serveur HTTP local suffit pour développer :

```bash
# Python (si installé)
python -m http.server 8080

# ou Node.js
npx serve .
```

Ouvrir ensuite `http://localhost:8080` dans le navigateur.

> ⚠️ Les ES Modules ne fonctionnent pas en ouvrant `index.html` directement depuis le système de fichiers (`file://`). Un serveur HTTP est obligatoire.

## Structure du projet

```
MonSantorin/
├── index.html          # Point d'entrée unique
├── manuel.html         # Manuel utilisateur (modale d'aide)
├── style.css           # Styles personnalisés (Bootstrap 5 via CDN)
├── js/
│   ├── constants.js    # Clés localStorage et constantes
│   ├── state.js        # Store central (données + persistance)
│   ├── engine.js       # Calculs purs — aucun effet DOM
│   ├── events.js       # Attachement des écouteurs DOM
│   ├── addons.js       # Utilitaires UI (parseMD, showConfirm…)
│   ├── editor.js       # Éditeur de barème et paramètres
│   ├── io.js           # Import/export CSV, JSON, ZIP
│   ├── student.js      # Gestion des élèves
│   ├── pdf.js          # Orchestration PDF
│   ├── pdf-renderer.js # Rendu Typst/WASM
│   ├── publipostage.js # Communication des notes
│   └── python-generator.js  # Génération scripts Python
└── .cursor/rules/      # Règles Cursor pour l'assistance IA
```

## Conventions de code

### Nommage

- Fonctions : `camelCase` — `loadStudent()`, `renderPasswordTable()`
- Constantes : `UPPER_SNAKE_CASE` — `STORAGE_KEYS`, `TT_FACTOR`
- IDs HTML : `kebab-case` — `btn-generate-pdf`, `conf-threshold-acquis`
- Variables privées dans `state.js` : préfixe `_` — `_students`, `_baremeConfig`

### Nouvelles données persistées

Toute nouvelle donnée à sauvegarder en `localStorage` requiert **trois étapes** :
1. Ajouter la clé dans `constants.js` → `STORAGE_KEYS`
2. Déclarer la variable privée avec chargement localStorage dans `state.js`
3. Ajouter le getter/setter dans l'objet `state`

### Modifier le barème ou les élèves

Toujours passer par `saveConfiguration()` (pour le barème) ou `saveCurrentState()` (pour les élèves) — ne jamais écrire directement dans `localStorage`.

### Ajouter un bouton

1. Ajouter le `<button id="btn-xxx">` dans `index.html`
2. Attacher l'écouteur dans `events.js` via `attachEventListeners()`
3. Ne jamais attacher d'écouteur dans un autre module

## Ce qu'il ne faut pas faire

- Ajouter une dépendance npm ou un outil de build
- Utiliser `window.confirm()` ou `window.prompt()` → utiliser `showConfirm()` de `addons.js`
- Toucher le DOM depuis `engine.js` ou dans les getters/setters de `state.js`
- Injecter du contenu utilisateur en `innerHTML` sans passer par `escapeHTML()` ou `parseMD()`
- Ajouter une propriété directement sur `state` sans la déclarer dans `state.js`

## Tester ses modifications

Pas de suite de tests automatisés. Protocole manuel minimal avant de soumettre :

1. **Démarrage propre** : ouvrir l'application sans données (Ctrl+Shift+Suppr → vider localStorage), vérifier l'état vide
2. **Charger l'exemple** : cliquer "Charger l'exemple", naviguer entre les élèves, générer un PDF
3. **Import/Export** : exporter en CSV, réimporter, vérifier que les notes sont identiques
4. **Cas ABS/TT** : marquer un élève absent, un autre TT, vérifier l'exclusion des stats et du ZIP
5. **Barème JSON** : exporter le barème, le réimporter, vérifier la cohérence

## Soumettre une modification

Le projet est hébergé sur forge.apps.education.fr. Suivre le workflow Git standard de la forge :
- Créer une branche depuis `main`
- Commits en français, message court et descriptif
- Ouvrir une merge request vers `main`
