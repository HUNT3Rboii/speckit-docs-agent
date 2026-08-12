# Changelog

## 0.1.0 — unreleased

First release of the standalone extension. Everything the previous version needed a Docker
stack for now happens inside VS Code.

### Added

- Convert a markdown file to a typeset PDF: cover page, contents, numbered headings, running
  headers, page-breaking tables and syntax-highlighted code.
- The full dashboard, as an editor tab: projects, artifacts with categories and tags, the kanban
  board, context files, exceptions, version history and the PDF viewer.
- Custom AI providers with a priority order, and model discovery for endpoints that support it.
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
