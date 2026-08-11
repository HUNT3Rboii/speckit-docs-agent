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

| Command | What it does |
|---|---|
| `Speckit Preview: Convert Current File to PDF` | Convert the open file |
| `Speckit Preview: Open Panel` | List every markdown file in the workspace, convert any of them |
| `Speckit Preview: Toggle Convert on Save` | Rebuild automatically when a file is saved, for this workspace |

PDFs are written under the extension's own storage, which VS Code removes when you uninstall.

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
printed. Anything that cannot be backed is dropped, and the output channel names what went and
why:

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
| `speckitStandalone.enrich` | `true` | Ask the editor's model for a summary, glossary and diagrams |
| `speckitStandalone.convertOnSave` | `false` | Rebuild a file's PDF when it is saved |
| `speckitStandalone.debounceMs` | `1500` | How long to wait after a save before converting |

## Troubleshooting

**Nothing happens on save.** `convertOnSave` is off by default. Check it, and check the file
isn't on the exception list.

**A diagram printed as code instead of a picture.** The panel was closed, or mermaid rejected
the syntax. The output channel says which.

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
