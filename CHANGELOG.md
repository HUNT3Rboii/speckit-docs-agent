# Changelog

## 0.2.1 — unreleased

### Fixed

- The dashboard comes back to the page it was on. VS Code destroys a hidden tab's DOM rather
  than pausing it, so every switch to another editor tab remounted the app on the project list -
  losing the document being read. The current page is now recorded through the editor's own
  webview state, which also survives a window restart.

## 0.2.0 — unreleased

### Changed

- **The extension is now called Colophon.** A colophon is the printer's note stating how a book
  was made, which is what this puts on every document's cover page. The old name belonged to the
  spec tooling the project was built with, not to what the extension does.
- The extension id is `HUNT3Rboii.colophon`, commands are `Colophon: …`, and settings moved from
  `speckitStandalone.*` to `colophon.*`. Endpoints configured under the old settings are still
  read until the AI models panel next saves, so a rename does not silently stop using a provider
  someone already set up.

## 0.1.2 — unreleased

### Fixed

- Page previews that the webview declined to load now fall back to the bytes themselves, fetched
  through the extension host. A rejected local resource produces no console entry and no failed
  request - only a broken image - so the panel no longer depends on that path succeeding.
- Each preview's path and rewritten URI are written to the output channel, which is the only way
  to tell a missing file from a refused one.

## 0.1.1 — unreleased

### Added

- A cover page carrying the document's title, its executive summary, and a metadata block:
  project, the provider that enriched it, the document type, the source file and the build time.

### Fixed

- An extension update that restyles the PDF now reaches documents nobody has edited since. The
  build cache keyed only on the document's text, so an unchanged file kept being served the PDF
  its previous template drew; the renderer is now part of that decision.
- Documents whose only build predates page rendering are rebuilt once, instead of leaving the
  panel's viewer permanently empty for them.
- Page previews are stored under a digest of the output path rather than `hash()`, whose seed is
  randomised per process - the same document previously scattered previews across a new directory
  on every restart.

## 0.1.0 — unreleased

First release of the standalone extension. Everything the previous version needed a Docker
stack for now happens inside VS Code.

### Added

- Convert a markdown file to a typeset PDF: cover page, contents, numbered headings, running
  headers, page-breaking tables and syntax-highlighted code.
- The full dashboard, as an editor tab: projects, artifacts with categories and tags, the kanban
  board, context files, exceptions, version history and the PDF viewer.
- An Activity Bar icon opening a view that reaches every part of the extension: the dashboard,
  the settings page, the AI providers panel, processing, and diagnostics.
- A settings page inside the dashboard, reached from the gear in its header: conversion, AI and
  diagnostics, each switch writing straight to VS Code's settings.
- A Custom AI Models panel: add endpoints, discover the models one serves, test it with a real
  request, and drag every provider — each custom model individually — into the order it is tried.
- Sections typed as tasks, user stories or design decisions, labelled in the PDF.
- The viewer shows the document as rendered pages. A webview has no PDF plugin, so the pages are
  images Typst renders alongside the PDF; the PDF itself is what the button opens.
- Mermaid diagrams render as captioned figures, placed where the code block was.
- A panel listing every markdown file in the workspace, with per-file conversion.
- Optional annotation — summary, glossary, diagrams — from the language model already
  available in the editor, with every claim checked against the source document. Anything that
  cannot be backed by a quote is dropped and reported.
- Convert on save, off by default, debounced, with a per-file exception list.
- Local history of what was built, per workspace.

### Changed from the Docker-era version

- **No Docker, no PostgreSQL, no API key.** The extension bundles its own Python interpreter and
  its own typesetter, and storage is a single SQLite file that VS Code removes on uninstall.
- **Typst replaces WeasyPrint.** WeasyPrint links native GTK/Pango libraries at runtime, which
  a VSIX cannot install on macOS or Windows.
- **Mermaid renders in the panel** rather than through a headless Chromium or a third-party API.
  Diagram rendering no longer sends document contents off the machine.
- Unchanged documents are not rebuilt; identity is content, not modification time.
