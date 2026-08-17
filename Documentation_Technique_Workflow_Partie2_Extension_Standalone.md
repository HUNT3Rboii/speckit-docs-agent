# Documentation Technique Complète — Workflow de Développement (Partie 2 : Extension Standalone)

> **Sujet :** Méthodologie Spec-Driven appliquée à une refonte sous contrainte de distribution — Extension VS Code autonome (VSIX unique)
> **Date :** 13 Août 2026
> **Statut :** Document Complet et Révisé
> **Document lié :** [Partie 1 — Projet Original](Documentation_Technique_Workflow_Partie1_Projet_Original.md)

## Sommaire

1. [Contexte : pourquoi une refonte plutôt qu'une évolution](#1-contexte--pourquoi-une-refonte-plutôt-quune-évolution)
2. [Phase 0 — Le dialogue de contraintes avec Claude](#2-phase-0--le-dialogue-de-contraintes-avec-claude)
3. [Phase 1 — `CLAUDE.md` comme substrat de spécification](#3-phase-1--claudemd-comme-substrat-de-spécification)
4. [Phase 2 — Implémentation avec Claude Code et boucles de vérification](#4-phase-2--implémentation-avec-claude-code-et-boucles-de-vérification)
5. [Phase 3 — Empaquetage, installation et discipline de version](#5-phase-3--empaquetage-installation-et-discipline-de-version)
6. [Architecture produite par ce workflow](#6-architecture-produite-par-ce-workflow)
7. [Cas d'étude : trois reprises menées de bout en bout](#7-cas-détude--trois-reprises-menées-de-bout-en-bout)
8. [Règles de collaboration avec l'agent](#8-règles-de-collaboration-avec-lagent)
9. [Comparaison des deux workflows](#9-comparaison-des-deux-workflows)
10. [Limites et points de vigilance](#10-limites-et-points-de-vigilance)
11. [Tableau récapitulatif du workflow](#11-tableau-récapitulatif-du-workflow)

---

## 1. Contexte : pourquoi une refonte plutôt qu'une évolution

La pile décrite en [partie 1](Documentation_Technique_Workflow_Partie1_Projet_Original.md) fonctionnait, mais exigeait de l'utilisateur final : Docker Desktop, une base de données, une clé d'API, et le maintien de plusieurs processus en parallèle. Pour un outil dont la promesse est « écris du markdown, obtiens un PDF », ce coût d'entrée est disqualifiant.

La refonte, portée par la branche `standalone-vsix`, part d'une exigence unique et non négociable :

> **Tout doit tenir dans un unique VSIX, s'exécuter sur la machine de l'utilisateur, et mourir avec la fenêtre de l'éditeur.**

L'extension issue de cette refonte est publiée sous le nom **Colophon** (identifiant `HUNT3Rboii.colophon`) : un colophon est la note d'imprimeur indiquant comment un ouvrage a été fabriqué — précisément ce que l'extension inscrit sur la page de garde de chaque document. Le nom précédent renvoyait à l'outillage de spécification employé pour construire le projet, et non à ce que l'extension fait.

### Inversion méthodologique

En partie 1, les contraintes de distribution ont été **découvertes** en cours de route. En partie 2, elles constituent **le point de départ** de la spécification. Cette inversion change la nature de la phase 0 : le dialogue ne cherche plus « que doit faire la fonctionnalité ? » mais « qu'est-ce que l'environnement d'exécution interdit ? », et la réponse fonctionnelle en découle.

---

## 2. Phase 0 — Le dialogue de contraintes avec Claude

### 2.1 Objet du dialogue

Le dialogue ne produit plus une spécification fonctionnelle mais un **jeu de contraintes dures** et un **registre de décisions d'architecture**. Chaque contrainte est formulée avec sa conséquence opérationnelle, faute de quoi elle est ignorée en pratique.

| Contrainte | Conséquence opérationnelle |
|---|---|
| Un VSIX est une archive de fichiers | Aucun serveur de base de données ; pas d'étape d'installation ; SQLite en fichier unique |
| L'hôte d'extension est Node | Python ne peut pas être importé ; il est **lancé en processus enfant** et joint par RPC |
| La webview est sous CSP stricte | Aucun `fetch()` direct vers le backend ; tout transite par `postMessage` → hôte → Python |
| La webview ne lit pas les fichiers par chemin | Toute ressource locale passe par `webview.asWebviewUri()` |
| L'état persistant appartient à l'éditeur | Stockage sous `context.globalStorageUri`, jamais dans le répertoire personnel |

### 2.2 Décisions d'architecture issues du dialogue

Chaque décision a été prise en confrontant au moins deux alternatives, et **le motif de rejet est consigné** — c'est ce qui empêche leur réouverture.

| Décision | Retenu | Rejeté | Motif du rejet |
|---|---|---|---|
| Moteur PDF | **Typst** | WeasyPrint | Dépendances natives GTK/Pango impossibles à fiabiliser dans un VSIX multi-plateformes |
| Moteur PDF | **Typst** | reportlab | Table des matières, en-têtes courants, tableaux à cheval sur les pages : à construire à la main |
| Diagrammes | **Mermaid dans la webview** | `mmdc` (Puppeteer) | ~150 Mo de Chromium par plateforme |
| Diagrammes | **Mermaid dans la webview** | API Kroki | Les documents de l'utilisateur quitteraient la machine |
| Interpréteur | **Python embarqué** | Dépendance à `ms-python.python` | Étape d'installation imposée à l'utilisateur |
| Base de données | **SQLite (mode WAL)** | PostgreSQL embarqué (`pgserver`) | Complexifie le multi-fenêtres et la couverture par plateforme |

> ⚠️ **POINT TECHNIQUE — DÉCISIONS FERMÉES :** ces choix sont marqués **« settled »** dans `CLAUDE.md`. Un agent qui propose de revenir à WeasyPrint ou à `mmdc` travaille contre une décision documentée : le motif de rejet est plus important que le choix lui-même, car c'est lui qui résiste au temps.

### 2.3 Décisions laissées ouvertes

Le dialogue distingue explicitement ce qui est arrêté de ce qui ne l'est pas. Les décisions ouvertes sont consignées comme telles, avec instruction de **demander plutôt que de trancher silencieusement** : moteur de base de données en cas de besoin de fonctionnalités PostgreSQL, et transport RPC (stdio contre LSP) si le backend devait faire de l'analyse de code.

---

## 3. Phase 1 — `CLAUDE.md` comme substrat de spécification

### 3.1 Rôle du fichier

En partie 1, la sortie de la phase 0 alimentait Spec Kit. Ici, elle alimente un fichier unique, versionné à la racine et **relu automatiquement à chaque session d'agent** : `CLAUDE.md`. Il ne remplace pas une spécification fonctionnelle ; il remplace la **re-explication du contexte à chaque session**.

### 3.2 Structure du fichier

| Section | Contenu | Fonction |
|---|---|---|
| *What this is* | Les quatre composants et leur relation | Situer toute modification dans l'architecture |
| *Hard constraints* | Les interdits, avec leur conséquence | Rejeter une conception avant qu'elle ne soit écrite |
| *Layout* | L'arborescence commentée | Éviter la recréation de structures existantes |
| *Conventions by area* | Règles par composant (hôte, Python, webview, PDF, diagrammes) | Uniformiser sans revue systématique |
| *Build and package* | Commandes et cibles de plateforme | Rendre l'empaquetage reproductible |
| *Open decisions* | Ce qui n'est pas tranché | **Demander** au lieu de décider |
| *Settled decisions* | Ce qui l'est, avec le motif | **Ne pas rouvrir** |
| *When making changes* | Règles transverses | Contrat des deux côtés d'une frontière |

### 3.3 Pourquoi ce format plutôt que Spec Kit ici

La refonte n'est pas une fonctionnalité nouvelle : c'est un **portage sous contrainte**. Les exigences fonctionnelles existent déjà — elles sont dans le système de la partie 1, dans `specs/001-documentation-agent/` et dans les specs Kiro. Ce qui manquait n'était pas *quoi* construire mais *ce que l'environnement interdit*. Rejouer `speckit.specify` aurait produit une spécification redondante ; `CLAUDE.md` produit le complément manquant.

> ⚠️ **POINT TECHNIQUE — CONTRAT DES DEUX CÔTÉS :** toute modification touchant la frontière extension ↔ Python doit mettre à jour le contrat de messages **des deux côtés dans le même commit** (`shared/protocol.ts` et `server/api.py`, avec `PROTOCOL_VERSION`). Un contrat modifié d'un seul côté est une compilation cassée pour la personne suivante — et un échec silencieux au moment du handshake.

---

## 4. Phase 2 — Implémentation avec Claude Code et boucles de vérification

### 4.1 Formulation du travail

Le travail est énoncé par **le résultat attendu**, jamais par la procédure. Exemple réel : « la page de garde ne change pas alors que j'ai retraité le document » — et non « modifie `template.typ` ». La différence est décisive : dans le cas cité, la page de garde était correcte et deux autres causes étaient en jeu (build installé obsolète, puis cache de rendu non invalidé). Une instruction procédurale aurait corrigé un fichier déjà correct.

### 4.2 Les quatre boucles de vérification

Aucune affirmation n'est produite sans exécution. Le projet dispose de quatre niveaux, du moins coûteux au plus probant :

| Niveau | Commande | Ce qu'il prouve | Ce qu'il ne prouve pas |
|---|---|---|---|
| Compilation | `npm run build` | Le typage de l'hôte et le bundle de la webview | Aucun comportement |
| Tests unitaires hôte | `npm test` (`node:test`) | Logique pure : providers, priorité, parsing, RPC | Rien de ce qui touche l'éditeur |
| Tests backend | `python -m pytest server/tests` | Surface RPC, base, validation, émetteur Typst | Le rendu réel |
| Harnais de fumée | `npm run smoke` | Spawn, handshake, conversion, PDF réel, destruction propre du processus enfant | Tout ce qui est **rendu à l'écran** |

Le harnais `scripts/smoke-host.mjs` remplace le module `vscode` au niveau du chargeur de modules et pilote `activate()` comme le ferait l'éditeur. C'est le seul niveau qui prouve que la libération des ressources tue effectivement le processus Python — le mode de défaillance que toute cette architecture cherche à éviter.

### 4.3 Vérification de ce qui est visuel

Ce que les quatre boucles ne couvrent pas — l'apparence du document — est vérifié par **relecture d'image** : le pipeline rend une page PNG par page de PDF, et la page produite est ouverte et examinée avant d'affirmer que la mise en page est correcte. C'est ainsi que la page de garde a été validée, et non par lecture du code Typst.

> ⚠️ **POINT TECHNIQUE — CE QU'AUCUN HARNAIS NE COUVRE :** webviews, vue de la barre d'activité et panneaux ne peuvent être prouvés sans instance réelle de l'éditeur. Ils exigent un passage manuel dans l'*Extension Development Host* (<kbd>F5</kbd>). Toute affirmation les concernant, faite sans ce passage, est une hypothèse.

---

## 5. Phase 3 — Empaquetage, installation et discipline de version

### 5.1 Empaquetage multi-plateformes

L'extension embarque un interpréteur Python et le binaire Typst : les VSIX sont donc **spécifiques à la plateforme** et construits séparément pour `win32-x64`, `linux-x64`, `darwin-x64` et `darwin-arm64`. `.vscodeignore` est porteur de sens : sources, tests, dépendances de développement et arborescence source de la webview doivent en rester exclus.

### 5.2 Règle de version

> ⚠️ **POINT TECHNIQUE — INSTALLATION LOCALE :** installer un VSIX **par-dessus la même version** revient à remplacer un dossier que l'éditeur en cours d'exécution tient ouvert. Sous Windows, l'opération échoue, supprime parfois le dossier existant, et laisse un enregistrement obsolète dans `extensions.json` — après quoi toute installation ultérieure est refusée par « *Please restart VS Code before reinstalling* ». **Il faut incrémenter la version avant tout empaquetage destiné à être installé** : une nouvelle version s'installe à côté, exactement comme une mise à jour du Marketplace.

Ce point n'est pas théorique : il a coûté plusieurs cycles de diagnostic pendant lesquels le symptôme observé (« la page de garde ne change pas ») n'avait aucun rapport avec le code modifié. Le script `scripts/install-standalone.ps1` automatise l'installation et répare l'enregistrement obsolète lorsqu'une tentative antérieure en a laissé un.

### 5.3 Intégration continue

Le workflow `.github/workflows/vsix.yml` exécute les tests puis empaquette les quatre cibles. Le workflow historique `ci.yml`, qui testait la pile Docker, a été supprimé avec elle.

---

## 6. Architecture produite par ce workflow

| Composant | Technologie | Rôle |
|---|---|---|
| `src/` | TypeScript (Node) | Hôte d'extension : activation, commandes, cycle de vie du processus, routage des messages |
| `webview-ui/` | React (build statique) | Dashboard rendu dans un onglet de l'éditeur |
| `server/` | Python (dépendances vendorisées) | Backend en processus enfant, JSON-RPC ligne à ligne sur stdio |
| `server/db/` | SQLite | Projets, artefacts, versions, tâches, exceptions |
| `server/pdf/` | Typst | `.md` → AST → `.typ` généré → PDF + un PNG par page |
| `bin/` | Python + Typst embarqués | Autonomie totale : aucune installation utilisateur |
| `shared/protocol.ts` | TypeScript | Contrat de messages, importé par les deux moitiés TypeScript |
| `resources/` | SVG + PNG | Icône de barre d'activité et logo Marketplace |

### Chaîne de communication

```
React → postMessage → hôte d'extension → JSON-RPC (stdio) → Python → retour
```

Aucun port réseau, aucun service, aucun état partagé entre utilisateurs.

---

## 7. Cas d'étude : trois reprises menées de bout en bout

Ces trois cas illustrent le workflow en situation réelle, y compris ses échecs de diagnostic.

### 7.1 Le panneau de gestion des modèles IA

**Symptôme rapporté :** « il n'y a pas de panneau de gestion des modèles IA ».

**Diagnostic :** le build standalone avait remplacé le panneau existant par une série de *quick picks*. Or un quick pick collecte trois chaînes de caractères ; il ne peut ni signaler une URL de base invalide, ni lister les modèles réellement servis par un endpoint, ni prouver que celui-ci répond avant qu'un document n'en dépende, ni ordonner chaque modèle individuellement.

**Traitement :** portage du panneau d'origine à l'identique au-dessus du nouveau transport, avec extraction de la logique pure (validation, normalisation, ordre de priorité) sous `src/ai/` afin qu'elle reste testable. Compatibilité ascendante conservée : les entrées écrites par le premier build standalone (`endpoint`/`model`) restent lues et sont converties au prochain enregistrement.

### 7.2 La page de garde qui ne changeait pas

**Symptôme rapporté :** « j'ai rechargé VS Code et retraité un PDF, la page de garde n'a pas changé ».

**Deux causes distinctes**, dont aucune n'était le fichier modifié :

1. **Le build installé était antérieur au changement.** Recharger l'éditeur recharge ce qui est *installé*, pas le dépôt.
2. **Le cache de construction ignorait le moteur de rendu.** La réutilisation était fondée sur le seul hachage du contenu du document : un fichier inchangé continuait donc de recevoir le PDF dessiné par l'ancien gabarit, et la nouvelle apparence n'aurait pu apparaître que sur des documents édités.

**Traitement :** empreinte de `template.typ`, `emitter.py` et `compile.py` intégrée à la décision de réutilisation, calculée **à chaque conversion** afin qu'une modification du gabarit prenne effet sans redémarrage du backend.

**Enseignement :** le symptôme ne désignait pas le fichier fautif. Vérifier ce qui est *réellement installé* précède toute lecture de code.

### 7.3 La visionneuse de PDF vide

**Symptôme rapporté :** capture d'écran montrant six images cassées.

**Lecture du symptôme :** six emplacements avec texte alternatif visible signifie que les six fichiers existent sur le disque (la méthode RPC filtre sur l'existence), que les URI ont été produites, et que **la webview les a refusées**. Ce refus est silencieux : ni entrée de console, ni requête en échec.

**Traitement :** chaque page tente d'abord l'URI réécrite, puis se rabat sur les octets du fichier transmis par l'hôte et rendus en `data:` URI, lecture confinée au stockage de l'extension. Journalisation systématique du chemin **et** de l'URI produite, seul moyen de distinguer un fichier absent d'une ressource refusée.

---

## 8. Règles de collaboration avec l'agent

Ces règles ne sont pas des préférences : chacune corrige une défaillance observée.

1. **Décrire le symptôme, pas le correctif.** Le fichier suspecté est souvent hors de cause (§ 7.2).
2. **Exiger la vérification, pas l'affirmation.** « Les tests passent » sans exécution est une hypothèse ; l'exécution et la lecture de la sortie sont la preuve.
3. **Une frontière se modifie des deux côtés dans le même commit.**
4. **Le message de commit explique le pourquoi ;** le quoi est dans le diff.
5. **Ne jamais exécuter `git checkout <fichier>` sur un fichier porteur de travail non commité.** L'opération est destructive et silencieuse : elle a effacé une page de garde terminée pendant cette refonte, qu'il a fallu réécrire.
6. **Committer par unités cohérentes,** une préoccupation par commit, et fréquemment — plusieurs heures de travail non commité représentent le risque le plus élevé du processus.
7. **Une alternative rejetée est consignée avec son motif,** sinon elle est re-proposée.

---

## 9. Comparaison des deux workflows

| Dimension | Partie 1 — Projet original | Partie 2 — Extension standalone |
|---|---|---|
| Point de départ | Les exigences fonctionnelles | Les contraintes de distribution |
| Substrat de spécification | `specs/` (Spec Kit) + `.kiro/specs/` | `CLAUDE.md` + les spécifications existantes |
| Outil de cadrage | GitHub Spec Kit | Dialogue, consigné en contraintes dures |
| Outil de construction | Kiro, puis Claude Code | Claude Code exclusivement |
| Nature du travail | Additif : nouvelles fonctionnalités | Portage sous contrainte : réécriture et suppression |
| Vérification | Tests par composant | Tests + harnais de fumée + relecture d'image rendue |
| Livraison | Docker Compose + services | VSIX unique, quatre plateformes |
| Coût pour l'utilisateur | Docker, base de données, clé d'API | Aucun |
| Risque principal | Dérive entre spécification, plan et code | Écart entre le dépôt et le build **installé** |

---

## 10. Limites et points de vigilance

- **Ce workflow suppose une spécification préexistante.** Il consolide et porte ; il ne remplace pas les phases 0 et 1 de la partie 1 pour une fonctionnalité réellement nouvelle.
- **`CLAUDE.md` n'est pas exécutable.** Rien ne vérifie qu'une contrainte y figurant est respectée ; seule la revue le fait.
- **La constitution Spec Kit reste non réécrite** (voir partie 1, § 3.4). Elle ne contraint toujours rien.
- **Le rabattement en `data:` URI est un correctif, pas une solution.** Il inline les octets de chaque page : acceptable pour quelques pages, coûteux pour un document de cinquante. La journalisation ajoutée existe pour réparer le chemin rapide, non pour s'installer dans le contournement.
- **Taille du VSIX :** 42,3 Mo par plateforme, dominés par l'interpréteur embarqué. Toute dépendance Python ajoutée se paie sur les quatre cibles.
- **Le multi-fenêtres reste à vérifier :** deux fenêtres VS Code signifient deux processus backend sur un même fichier SQLite, d'où le mode WAL — la couverture réelle de ce scénario n'est pas encore testée automatiquement.

---

## 11. Tableau récapitulatif du workflow

| Phase | Outil | Entrée | Sortie | Critère de sortie |
|---|---|---|---|---|
| 0 — Contraintes | Claude (dialogue) | Exigence de distribution, système existant | Contraintes dures + décisions fermées avec motifs | Chaque contrainte a une conséquence opérationnelle |
| 1 — Substrat | `CLAUDE.md` versionné | Sortie de la phase 0 | Contraintes, conventions, décisions ouvertes/fermées | L'agent démarre une session sans ré-explication |
| 2 — Implémentation | Claude Code | `CLAUDE.md` + spécifications existantes + code | Code, tests, documentation, commits | Quatre boucles vertes + vérification visuelle |
| 3 — Livraison | `vsce`, script d'installation | Build vérifié | VSIX par plateforme, version incrémentée | Installation propre et rechargement de fenêtre |

---

## Conclusion

La partie 2 ne remplace pas la méthodologie de la partie 1 : elle en constitue le cas limite, celui où **la contrainte d'exécution précède la fonctionnalité**. Le dialogue avec Claude reste le point d'entrée, mais il produit un jeu de contraintes plutôt qu'un énoncé fonctionnel ; `CLAUDE.md` remplace les artefacts Spec Kit parce que les exigences existaient déjà ; Claude Code assure seul l'implémentation parce que le travail est transverse par nature.

Le fil conducteur des deux parties est identique et tient en une phrase : **ce qui n'a pas été discuté avant d'être spécifié, ni vérifié avant d'être affirmé, revient plus tard sous forme de bug muni d'un numéro de tâche.** Les trois cas d'étude du § 7 en sont l'illustration directe — dans chacun, le symptôme rapporté et la cause réelle se trouvaient dans des composants différents.
