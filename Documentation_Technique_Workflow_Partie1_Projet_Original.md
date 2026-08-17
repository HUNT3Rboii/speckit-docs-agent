# Documentation Technique Complète — Workflow de Développement (Partie 1 : Projet Original)

> **Sujet :** Méthodologie Spec-Driven et chaîne d'outils IA — Pile Docker (backend FastAPI, dashboard React, extension VS Code)
> **Date :** 13 Août 2026
> **Statut :** Document Complet et Révisé
> **Document lié :** [Partie 2 — Extension Standalone](Documentation_Technique_Workflow_Partie2_Extension_Standalone.md)

## Sommaire

1. [Vue d'ensemble de la chaîne d'outils](#1-vue-densemble-de-la-chaîne-doutils)
2. [Phase 0 — Élaboration de la spécification par dialogue avec Claude](#2-phase-0--élaboration-de-la-spécification-par-dialogue-avec-claude)
3. [Phase 1 — Architecture et cadrage avec GitHub Spec Kit](#3-phase-1--architecture-et-cadrage-avec-github-spec-kit)
4. [Phase 2 — Construction initiale avec Kiro](#4-phase-2--construction-initiale-avec-kiro)
5. [Phase 3 — Bascule vers Claude Code](#5-phase-3--bascule-vers-claude-code)
6. [Architecture produite par ce workflow](#6-architecture-produite-par-ce-workflow)
7. [Critères de passage d'un outil à l'autre](#7-critères-de-passage-dun-outil-à-lautre)
8. [Contrôle qualité et définition du « terminé »](#8-contrôle-qualité-et-définition-du--terminé-)
9. [Traçabilité des artefacts produits](#9-traçabilité-des-artefacts-produits)
10. [Limites rencontrées et enseignements](#10-limites-rencontrées-et-enseignements)
11. [Tableau récapitulatif du workflow](#11-tableau-récapitulatif-du-workflow)

---

## 1. Vue d'ensemble de la chaîne d'outils

Le projet original — un agent de documentation composé d'un backend FastAPI, d'un dashboard React et d'une extension VS Code — n'a jamais été développé « en écrivant du code ». Chaque fonctionnalité a suivi une chaîne à quatre maillons, chacun retenu pour ce qu'il fait réellement bien, et abandonné au moment précis où il cesse d'être rentable.

```
Dialogue avec Claude  →  GitHub Spec Kit  →  Kiro  →  Claude Code
   la spécification       l'architecture     les premières      tout le reste
                                              constructions
```

### Principe directeur

**Aucune ligne n'est écrite avant que la fonctionnalité ne soit descriptible en un paragraphe, ses contraintes en une liste, et ses alternatives rejetées en une phrase chacune.** L'ordre des outils n'est pas une préférence esthétique : il correspond à la décroissance de l'incertitude. Tant que le problème est flou, l'outil est conversationnel ; quand il devient structurel, l'outil devient un générateur d'artefacts ; quand il devient local, l'outil devient un IDE ; quand il redevient transverse, l'outil redevient un agent à large contexte.

### Rôle de chaque maillon

| Maillon | Nature | Ce qu'il produit | Ce qu'il ne doit pas produire |
|---|---|---|---|
| **Claude (dialogue)** | Conversation ouverte | Le problème, les contraintes, les non-objectifs, le registre de décisions | Du code, ou une spécification formatée |
| **GitHub Spec Kit** | Générateur d'artefacts | `spec.md`, `plan.md`, `tasks.md`, checklists | Un choix de bibliothèque dans la spécification |
| **Kiro** | IDE agentique | Code des fonctionnalités additives et locales | Un changement transverse à trois composants |
| **Claude Code** | Agent à large contexte | Refactors, portages, corrections transverses, vérification | Des décisions d'architecture non discutées |

---

## 2. Phase 0 — Élaboration de la spécification par dialogue avec Claude

### 2.1 Motivation

Une description de fonctionnalité saisie directement dans un outil de spécification produit un document **cohérent avec lui-même et avec rien d'autre**. Le dialogue préalable existe pour faire émerger la forme réelle du problème avant qu'une structure ne lui soit imposée.

### 2.2 Les cinq livrables du dialogue

- **Le comportement observable :** ce que l'utilisateur fait, et ce qu'il voit ensuite. Formulation proscrite : « ajouter une couche de cache ». Formulation attendue : « enregistrer un fichier inchangé ne doit coûter aucun appel au modèle, et l'utilisateur doit être informé que le PDF a été réutilisé plutôt que reconstruit ».
- **Les contraintes non négociables, avec leur justification.** Ce sont celles qui tuent une conception si elles apparaissent tard : une webview n'a aucune permission réseau, un VSIX ne peut pas embarquer un serveur de base de données, l'hôte d'extension est du Node et ne peut pas exécuter Python.
- **Les non-objectifs, explicitement.** Toute fonctionnalité attire du travail adjacent ; ce qui est écarté ici est ce qui ne réapparaît pas à mi-implémentation.
- **Les modes de défaillance à concevoir :** lesquels sont récupérables, lesquels sont visibles par l'utilisateur, lesquels sont **silencieux**. La dernière catégorie est celle où se logent les bugs coûteux.
- **Le registre de décisions :** choix retenu, alternatives rejetées, et le motif du rejet. Une alternative rejetée avec un motif attaché n'est pas re-proposée trois semaines plus tard.

### 2.3 Conduite du dialogue

1. **Énoncer le problème, pas la solution.** Une solution énoncée en ouverture est adoptée par défaut et jamais examinée.
2. **Demander les compromis avant la recommandation**, puis demander la recommandation. L'ordre inverse produit une justification a posteriori.
3. **Contester ce qui paraît propre.** La réponse élégante est en général celle qui n'a pas encore rencontré la contrainte.
4. **Poser « qu'est-ce qui casse ça ? » avant « comment je le construis ? »**
5. **Faire reformuler le problème par l'agent.** Si la reformulation est fausse, la spécification l'aurait été aussi.

> ⚠️ **POINT TECHNIQUE — SORTIE DU DIALOGUE :** la sortie de cette phase est un texte, pas une intention. Ce paragraphe et ces listes constituent l'**entrée littérale** de Spec Kit. Relancer Spec Kit avec un nouveau prompt rédigé de mémoire annule tout le bénéfice de la phase 0.

### 2.4 Critère de sortie

La phase 0 est terminée lorsque la fonctionnalité tient en un paragraphe, ses contraintes en une liste à puces, et chaque alternative rejetée en une phrase.

---

## 3. Phase 1 — Architecture et cadrage avec GitHub Spec Kit

### 3.1 Rôle de Spec Kit dans la chaîne

Spec Kit transforme le dialogue en **artefacts qui survivent à la session**. Sa valeur est la structure et la traçabilité : des exigences numérotées, un plan qui les référence, des tâches qui référencent le plan.

### 3.2 Séquence des agents

| Agent | Artefact produit | Fonction réelle |
|---|---|---|
| `speckit.constitution` | `.specify/memory/constitution.md` | Les règles auxquelles tout artefact ultérieur est confronté |
| `speckit.specify` | `specs/<nnn>-<nom>/spec.md` | Les exigences, numérotées et testables, sans implémentation |
| `speckit.clarify` | Amendements à la spécification | Épuiser l'ambiguïté **avant** qu'elle ne devienne un plan |
| `speckit.plan` | `specs/<nnn>-<nom>/plan.md` | L'approche technique, une décision par contrainte |
| `speckit.tasks` | `specs/<nnn>-<nom>/tasks.md` | Le travail ordonné, chaque item vérifiable |
| `speckit.checklist` | `checklists/*.md` | La définition du « terminé », par domaine |
| `speckit.analyze` | Rapport d'analyse | Contrôle croisé spécification / plan / tâches |
| `speckit.implement` | Code | Exécution d'une tâche identifiée |

Les fichiers d'agents correspondants sont versionnés sous `.github/agents/speckit.*.agent.md`, et les gabarits sous `.specify/templates/`.

### 3.3 Artefacts effectivement produits

Le cadrage initial du projet a produit `specs/001-documentation-agent/` :

| Fichier | Contenu |
|---|---|
| `spec.md` | Spécification fonctionnelle du pipeline de documentation |
| `plan.md` | Plan technique et découpage architectural |
| `tasks.md` | Tâches ordonnées et numérotées (`T001`, `T002`, …) |
| `checklists/requirements.md` | Contrôle de complétude des exigences |
| `checklists/pipeline-requirements.md` | Contrôle spécifique au pipeline de rendu |

### 3.4 Règles d'usage

- **La spécification ne nomme jamais une bibliothèque.** Dès qu'elle le fait, le plan n'a plus rien à décider et la décision n'est jamais examinée.
- **`speckit.clarify` est exécuté avant `speckit.plan`, systématiquement.** Une ambiguïté qui atteint le plan devient une conception ; une ambiguïté qui atteint les tâches devient un bug muni d'un numéro de tâche.
- **Les tâches sont dimensionnées pour être vérifiables, pas pour être égales.** Une tâche qui ne peut pas être contrôlée à son achèvement est en réalité deux tâches.
- **`speckit.analyze` avant toute implémentation.** C'est la seule étape qui lit les trois documents simultanément, donc la seule qui révèle leur dérive mutuelle.

> ⚠️ **POINT TECHNIQUE — CONSTITUTION NON RÉÉCRITE :** le fichier `.specify/memory/constitution.md` du dépôt contient encore une constitution de site marchand, héritée d'une exécution de gabarit. Elle n'a jamais été réécrite pour ce projet et n'a donc **contraint aucun artefact** — soit exactement la défaillance que l'étape « constitution » est censée prévenir. Toute réexécution de ce workflow doit commencer par sa réécriture.

---

## 4. Phase 2 — Construction initiale avec Kiro

### 4.1 Rôle et format

Kiro a construit les premières parties substantielles du système. Son format de spécification lui est propre et se décompose en trois fichiers par fonctionnalité, stockés sous `.kiro/specs/<fonctionnalité>/` :

- **`requirements.md`** — exigences en style EARS (*WHEN* … *THE SYSTEM SHALL* …), numérotées et acceptables une par une
- **`design.md`** — la conception technique, écrite **avant** le code
- **`tasks.md`** — le découpage exécutable, tâche par tâche

L'IDE étant l'environnement d'exécution, la boucle entre une tâche et du code qui tourne est courte.

### 4.2 Fonctionnalités construites par ce canal

| Spécification Kiro | Périmètre livré | Volume de conception |
|---|---|---|
| `agentic-pdf-pipeline` | Pipeline markdown → enrichissement validé → PDF | `design.md` ≈ 45 Ko |
| `pdf-visualization-frontend` | Dashboard React : projets, artefacts, versions | `design.md` ≈ 28 Ko |
| `vscode-speckit-auto-ai` | Extension : commandes, détection de providers, client backend | `design.md` ≈ 19 Ko |
| `diagram-rendering-in-pdfs` | Rendu Mermaid et placement des diagrammes | `design.md` ≈ 25 Ko |

### 4.3 Domaine de pertinence

**Ce que Kiro traite bien :** une fonctionnalité majoritairement **additive** et **locale** — une nouvelle page, un nouvel endpoint, une nouvelle classe de service. La spécification est détaillée, la conception précède le code, et les tâches s'exécutent une à une avec le fichier sous les yeux.

**Ce qu'il ne porte pas :** un changement qui touche simultanément le backend, l'extension et le dashboard. Le document de conception décrit ce qui doit se produire dans les trois ; maintenir les trois en tête pendant l'édition est un problème d'une autre nature.

---

## 5. Phase 3 — Bascule vers Claude Code

### 5.1 Motifs de la bascule

La bascule s'est produite lorsque le travail a cessé d'être additif. Les motifs, par ordre d'importance réelle :

1. **La fenêtre de contexte.** Un changement transverse — le contrat de messages, la chaîne de providers, le pipeline de validation — exige que le backend, l'extension et le dashboard soient visibles en même temps. Raisonner sur trois fichiers **lus** est structurellement différent de raisonner sur trois fichiers **décrits**.
2. **La vérification dans la même boucle que l'édition.** Lancer les tests, lire l'échec et corriger sans quitter la session est ce qui rend un refactor de grande ampleur *finissable*. Un outil qui écrit du code et le rend pour exécution double le nombre d'allers-retours.
3. **Le jugement sur le code existant.** Le travail tardif consiste à porter, supprimer et réconcilier — donc à déterminer *à quoi servait* un composant avant de le remplacer. C'est une tâche de lecture avant d'être une tâche d'écriture.

### 5.2 Formulation du travail

Le travail n'est pas formulé « implémente la tâche T042 », mais **par le résultat attendu et ses contraintes**, la spécification et le document de conception restant accessibles. La liste de tâches demeure la source de vérité du *quoi* ; la session décide du *comment* et le consigne dans le message de commit.

### 5.3 Règles non négociables de cette phase

- **Vérifier avant d'affirmer.** Les tests sont exécutés, la sortie est lue, et le résultat réel est énoncé — y compris lorsqu'il est en échec.
- **Les deux côtés d'une frontière dans le même commit.** Un changement de contrat qui n'atterrit que d'un côté est une compilation cassée pour la personne suivante.
- **Une alternative rejetée est consignée**, afin de ne pas être re-proposée.
- **Le message de commit explique le pourquoi.** Le quoi est dans le diff.

---

## 6. Architecture produite par ce workflow

Pour situer le workflow, voici le système qu'il a effectivement produit — celui qui subsiste sur la branche `main` :

| Composant | Technologie | Rôle |
|---|---|---|
| `backend/` | FastAPI (Python), SQLAlchemy | Service HTTP : validation, pipeline, rendu PDF, tickets |
| `frontend/` | React + Vite | Dashboard : projets, artefacts, versions, Kanban |
| `vscode-extension/` | TypeScript | Extension : commandes, providers IA, client HTTP du backend |
| `infra/` | Docker Compose | Orchestration locale du backend et de sa base |
| Base de données | PostgreSQL / SQLite | Projets, artefacts, versions, exécutions |
| Rendu PDF | HTML → WeasyPrint | Génération des documents |
| Diagrammes | Mermaid CLI (`mmdc`) ou API Kroki | Rendu des schémas |

### Coût structurel de cette architecture

Ce système exige de l'utilisateur : Docker Desktop, une base de données en fonctionnement, une clé d'API pour l'appel au service, et **quatre terminaux** simultanés en développement (agent, React, FastAPI, watcher). C'est précisément ce coût qui motive la partie 2 de cette documentation.

---

## 7. Critères de passage d'un outil à l'autre

| Situation | Outil approprié |
|---|---|
| La fonctionnalité n'est pas encore descriptible en un paragraphe | Claude, en dialogue |
| Les exigences existent, l'architecture non | GitHub Spec Kit |
| La conception est arrêtée, le travail est additif et local | Kiro |
| Le changement traverse plusieurs composants, ou touche du code existant | Claude Code |
| Le sujet est une décision, non une implémentation | Retour au dialogue |

> ⚠️ **POINT TECHNIQUE — SIGNAL DE BASCULE :** le signal fiable n'est pas la taille de la tâche mais **le nombre de fichiers qu'il faut avoir compris pour en écrire un seul**. Au-delà de deux ou trois, l'IDE agentique travaille de mémoire décrite, et les régressions apparaissent aux frontières.

---

## 8. Contrôle qualité et définition du « terminé »

Une fonctionnalité est considérée comme terminée lorsque les six conditions suivantes sont remplies :

1. Un paragraphe, une liste de contraintes et un registre de décisions issus de la phase 0
2. Une spécification numérotée dont chaque exigence est individuellement testable
3. Un plan qui répond explicitement à chaque contrainte
4. Des tâches individuellement vérifiables à leur achèvement
5. Du code accompagné de tests qui échouent en son absence
6. La documentation mise à jour **dans le même commit** que le comportement qu'elle décrit

### Points de contrôle automatisés

| Contrôle | Commande | Portée |
|---|---|---|
| Tests backend | `pytest tests/` (dans `backend/`) | Services, pipeline, validation |
| Tests extension (logique pure) | `npm run test:unit` | Parsing, providers, priorité |
| Tests dashboard | `npm run test` | Composants et hooks React |
| Typage et lint | `npm run compile`, `npm run lint`, `tsc -b --noEmit` | Extension et dashboard |

---

## 9. Traçabilité des artefacts produits

| Outil | Artefact | Emplacement dans le dépôt |
|---|---|---|
| Dialogue Claude | Paragraphe, contraintes, décisions | Entrée de Spec Kit (non versionné en tant que tel) |
| Spec Kit | Constitution | `.specify/memory/constitution.md` |
| Spec Kit | Gabarits | `.specify/templates/` |
| Spec Kit | Spécification, plan, tâches, checklists | `specs/001-documentation-agent/` |
| Spec Kit | Définitions d'agents | `.github/agents/speckit.*.agent.md` |
| Kiro | Exigences EARS, conception, tâches | `.kiro/specs/<fonctionnalité>/` |
| Kiro / Copilot | Contrat de mise à jour des tâches | `.github/copilot-instructions.md` |
| Suivi d'exécution | État par tâche | `.speckit-auto-ai/progress/T00N.json` |
| Claude Code | Code, tests, messages de commit | Historique Git |

---

## 10. Limites rencontrées et enseignements

- **Constitution jamais réécrite.** L'étape la moins coûteuse de Spec Kit est aussi celle qu'on saute ; son absence ne provoque aucune erreur, seulement une absence de garde-fou.
- **La spécification nomme parfois la solution.** Chaque occurrence a produit un plan sans arbitrage réel. Le contrôle est simple : si le plan n'a rien à décider, la spécification est allée trop loin.
- **Quatre terminaux en développement.** Agent, React, FastAPI, watcher : le coût d'entrée quotidien a fini par dépasser celui de l'écriture du code, ce qui a motivé d'abord l'extension pilote, puis la refonte standalone.
- **Dépendances natives du rendu.** WeasyPrint s'appuie sur Pango/Cairo, donc sur des bibliothèques système installées hors du projet — invérifiable depuis le dépôt, et fatal dès qu'on vise une distribution empaquetée.
- **Les changements transverses tardifs coûtent cher.** Les contrats (HTTP, base, messages) auraient dû être fixés en phase 1 ; chaque évolution ultérieure a dû être appliquée en trois endroits.
- **L'agent ne doit pas décider seul de l'architecture.** Les décisions structurantes reviennent au dialogue ; l'agent les applique et les consigne.

---

## 11. Tableau récapitulatif du workflow

| Phase | Outil | Entrée | Sortie | Critère de sortie |
|---|---|---|---|---|
| 0 — Spécification | Claude (dialogue) | Intention, contexte, contraintes pressenties | Paragraphe + contraintes + non-objectifs + décisions | La fonctionnalité tient en un paragraphe |
| 1 — Architecture | GitHub Spec Kit | Sortie de la phase 0 | `spec.md`, `plan.md`, `tasks.md`, checklists | `speckit.analyze` sans dérive |
| 2 — Construction | Kiro | `requirements.md`, `design.md`, `tasks.md` | Code des fonctionnalités additives | Tâches cochées et testées |
| 3 — Consolidation | Claude Code | Code existant + spécifications | Refactors, portages, corrections transverses | Tests verts et vérification énoncée |

---

## Conclusion

Le workflow du projet original repose sur une idée unique : **l'incertitude se réduit par étapes, et chaque étape mérite un outil différent**. Le dialogue avec Claude produit la compréhension, Spec Kit la fige en artefacts traçables, Kiro construit ce qui est local et additif, Claude Code prend en charge ce qui est transverse et existant.

Les limites rencontrées — constitution non réécrite, contrats fixés trop tard, dépendances natives, quatre terminaux — ne remettent pas en cause la chaîne, mais elles ont déterminé la suite : une refonte où la contrainte de distribution devient le point de départ de la spécification, et non sa découverte tardive. C'est l'objet de la [partie 2](Documentation_Technique_Workflow_Partie2_Extension_Standalone.md).
