# Speckit

Turn markdown into typeset PDF documentation, inside VS Code, with nothing to install.

[![VSIX](https://github.com/HUNT3Rboii/speckit-docs-agent/actions/workflows/vsix.yml/badge.svg)](https://github.com/HUNT3Rboii/speckit-docs-agent/actions/workflows/vsix.yml)
![Version](https://img.shields.io/badge/version-0.1.0-blue)
[![License](https://img.shields.io/badge/license-MIT-orange)](LICENSE)

Open a `.md` file, run **Speckit Preview: Convert Current File to PDF**, and you get a
typeset document: cover page, contents, numbered headings, running headers, page-breaking
tables, syntax-highlighted code, and your mermaid diagrams rendered as figures.

No Docker. No database to run. No API key. The extension carries its own Python and its own
typesetter, and uses whatever AI you already have in your editor.

## Install

Install from the Marketplace, or from a `.vsix`:

```
code --install-extension speckit-win32-x64.vsix
```

Downloads are per platform — `win32-x64`, `linux-x64`, `darwin-x64`, `darwin-arm64` — because
the interpreter and typesetter are bundled. The Marketplace serves the right one automatically.

## Using it

Click the Speckit icon in the Activity Bar. Every part of the extension is one click from
there: the dashboard, the settings page, the AI providers panel, processing the current file,
and the diagnostics. Rows that mirror a setting show its state — auto-processing reads `on` or
`off` without opening anything.

**Open dashboard** is the full interface — projects, artifacts with their categories and tags,
the kanban board built from your `tasks.md`, context files, exceptions, version history and the
PDF viewer. It opens as an editor tab, with a gear in its header for the settings page.

Everything is on the Command Palette too:

| Command | What it does |
|---|---|
| `Speckit: Process Current File` | Convert the open file |
| `Speckit: Open Dashboard` | The full panel |
| `Speckit: Open Settings` | The dashboard's settings page |
| `Speckit: Show Extension Logs` | Everything that happened, in detail |
| `Speckit: Check Backend Status` | Confirm the bundled backend is running |
| `Speckit: Toggle Auto-Processing` | Convert on save, for this workspace |
| `Speckit: Stop Processing` | Cancel in-flight AI requests and queued work |
| `Speckit: Manage AI Providers` | Add endpoints, reorder which is tried first |
| `Speckit: Discover Models for Custom Provider` | Ask an endpoint what it can run |

PDFs are written under the extension's own storage, which VS Code removes when you uninstall.

### The board

A `tasks.md` file becomes a kanban board, re-synced on every render. The file owns everything
except where a card sits — drag a card and the next save will not undo it.

### Diagrams

Fenced ` ```mermaid ` blocks become figures, captioned with the heading above them. Rendering
happens in the panel — it is a browser, which is what mermaid needs — so **the panel must be
open** for diagrams to render. With it closed, the diagram's source is printed instead and the
log says so.

### Annotation, and why you can trust it

With a language model available, Speckit also proposes a summary, a glossary, and diagrams for
relationships your document describes.

Every claim has to quote your document. Each proposed glossary entry and each diagram component
carries a verbatim excerpt, and that excerpt is checked against your text before anything is
printed.

When something fails that check, the model is told exactly which quotes were not found and asked
again — a line quoted from memory with one word wrong is a real entry about a real term, and
usually gets fixed on the second pass. What still cannot be backed after that is dropped, and the
output channel names what went and why:

```
[dropped] glossary "Kubernetes" - the term does not appear in the document
[dropped] component "d1: Redis Cache" - not backed by a quote from the document
```

Nothing invented reaches the PDF. Turn it off entirely with `speckitStandalone.enrich`.

The model is whichever one your editor already provides — GitHub Copilot, or anything else
registered with VS Code. There is no key to configure and nothing is billed twice.

## Settings

| Setting | Default | What it does |
|---|---|---|
| `speckitStandalone.enrich` | `true` | Ask an AI provider for a summary, glossary and diagrams |
| `speckitStandalone.autoProcess` | `false` | Convert a file when it is saved |
| `speckitStandalone.includePatterns` | `["**/*.md"]` | Which files to process |
| `speckitStandalone.excludePatterns` | *(scaffolding)* | Which to skip — tool-generated folders by default |
| `speckitStandalone.providerPriority` | Copilot first | Order in which AI providers are tried |
| `speckitStandalone.customModels` | `[]` | Your own OpenAI-compatible endpoints |
| `speckitStandalone.preferredModelId` | *(empty)* | Prefer a model whose id contains this |
| `speckitStandalone.allowRuleBasedFallback` | `false` | Build a plain PDF when no AI is available, instead of failing |
| `speckitStandalone.debounceMs` | `1500` | How long to wait after a save before converting |
| `speckitStandalone.maxConcurrentProcessing` | `3` | How many files convert at once |
| `speckitStandalone.enableDebugLogging` | `false` | Verbose logging |

### Settings

The gear in the dashboard header opens a settings page covering conversion, AI and diagnostics.
Every switch writes straight to VS Code's settings, so nothing there is a second copy of state —
the same values are editable in the settings editor, and **Open in VS Code settings** goes
there. The provider try order is shown but not edited here; that belongs to the AI models panel,
which the page links to.

### Your own models

**Speckit: Manage AI Providers** opens a panel for OpenAI-compatible endpoints — a local Ollama,
a company gateway. Each entry is a base URL, a model name and an optional key; **Discover models**
lists what the endpoint actually serves, and **Test connection** sends one real request, because a
`/models` listing succeeding says nothing about whether generation is permitted.

The same panel holds the try order. Every provider is a row — Copilot, Claude, Kiro, Generic and
each custom model by name — and they are tried top to bottom; drag one above Copilot to make it
the primary, or remove it to never try it at all. A provider that fails or returns nothing usable
falls through to the next one.

## Troubleshooting

**Nothing happens on save.** `convertOnSave` is off by default. Check it, and check the file
isn't on the exception list.

**A diagram printed as code instead of a picture.** The panel was closed, or mermaid rejected
the syntax. The output channel says which.

**The viewer says there is no page preview.** That document was built before previews existed.
Press Retry to rebuild it.

**A glossary entry I expected is missing.** It was dropped because its quote wasn't found in
your document — the reason is in the output channel. That is the evidence check working.

**"No language model is available."** Install and sign in to Copilot, or set
`speckitStandalone.enrich` to `false` to build plain PDFs.

Everything else lives in the **Speckit Preview** output channel.

## Building it yourself

```bash
npm install
npm --prefix webview-ui install
npm run fetch-runtimes        # pinned Python + Typst for your platform
npm run vendor-deps           # backend dependencies into server/vendor
npm run build
npm test                      # extension host
npm run test:python           # backend
npm run smoke                 # whole pipeline, no editor required
npx @vscode/vsce package --target win32-x64
```

Architecture, the constraints a VSIX imposes, and why Typst rather than anything else:
[CLAUDE.md](CLAUDE.md). Contributions: [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE).
