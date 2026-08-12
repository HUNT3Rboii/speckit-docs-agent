# Development Guide

Internals and how to work on the code. If you just want to *use* the extension, the [README](README.md) is all you need.

## Contents

- [What this is](#what-this-is)
- [Layout](#layout)
- [The build loop](#the-build-loop)
- [The extension ↔ Python boundary](#the-extension--python-boundary)
- [The PDF pipeline](#the-pdf-pipeline)
- [Diagrams](#diagrams)
- [Testing](#testing)
- [Packaging and installing](#packaging-and-installing)
- [End-to-end walkthrough](#end-to-end-walkthrough)
- [When something goes wrong](#when-something-goes-wrong)

## What this is

One VSIX with four moving parts, all on the user's machine:

1. **Extension host** — TypeScript on Node, inside VS Code. Activation, commands, the child process, and the message broker.
2. **Webview UI** — a React app rendered in an editor tab, built to static assets and loaded from disk.
3. **Python backend** — spawned as a child process, speaking line-delimited JSON-RPC over stdio. It owns all data access.
4. **SQLite database** — one file per user under the extension's global storage.

There is no server, no cloud, and no shared state between users. Everything dies with the editor window.

The constraints that follow from that shape are in [CLAUDE.md](CLAUDE.md), and they are not negotiable: a VSIX cannot contain a database server, Python cannot run inside the extension host, the React app cannot `fetch()` the backend, and the webview cannot load a file by path.

## Layout

```
src/                    Extension host (TypeScript)
  extension.ts          activate() / deactivate(), host-answered RPC methods
  commands.ts           Everything that is not the conversion itself
  backend/              Spawn, handshake, shutdown, RPC client
  ai/                   Providers, prompt, parsing, retry, custom endpoints
  webview/              The dashboard panel, the AI models panel, the Activity Bar view
  markdown/             Mermaid block detection, diagram cache
webview-ui/             React dashboard (own package.json, own build)
  dist/                 Build output — this is what ships
server/                 Python backend
  main.py               Entry point; takes --storage-path and --typst
  api.py                The RPC surface, one method per old HTTP endpoint
  db/                   Schema, migrations, queries
  pdf/                  Markdown → Typst emitter, template, compiler driver
  vendor/               Python dependencies, vendored rather than installed
bin/                    Bundled Python + typst, per platform
resources/              Activity Bar icon and Marketplace logo
shared/protocol.ts      The message contract, imported by both TypeScript sides
```

## The build loop

```bash
npm install
npm --prefix webview-ui install
npm run fetch-runtimes    # bundled Python + typst for this platform, into bin/
npm run vendor-deps       # server/requirements.txt into server/vendor/
npm run build             # extension host + webview
```

Then <kbd>F5</kbd> launches an Extension Development Host with the extension loaded from `out/` — no packaging, no installing. `npm run watch` recompiles the host as you edit; the webview needs `npm run build:webview` (or its own dev server) since the panel loads its built bundle from disk.

`npm run fetch-runtimes` pins versions in `runtimes.lock.json`. The Typst version is pinned deliberately — compiler upgrades are breaking changes.

## The extension ↔ Python boundary

The webview never talks to Python directly. Every call goes:

```
React → postMessage → extension host → JSON-RPC over stdio → Python → back
```

- `shared/protocol.ts` holds the message shapes and is imported by both TypeScript halves. `PROTOCOL_VERSION` in `server/api.py` is checked at handshake; bump it when the contract changes.
- A handful of methods are answered by the host itself rather than forwarded — `HOST_METHODS` in `src/extension.ts`. They are the ones needing the editor: the workspace, a file on disk, a window to open something in, or a webview URI.
- The backend exits when stdin closes. That is the reliable parent-death signal: `deactivate()` does not always run, and an orphaned Python process is a known failure mode.
- Migrations run on startup. An extension update arriving at an older database is the normal case.

## The PDF pipeline

```
.md → markdown-it-py → AST → generated .typ → typst compile → .pdf (+ PNG per page)
```

- `server/pdf/emitter.py` decides what each markdown construct *is*. It emits Typst as text on purpose: when a PDF looks wrong, the generated `.typ` is right there to read.
- `server/pdf/template.typ` decides what everything *looks like* — cover page, headings, code blocks, tables, figures. Generated content carries no styling of its own.
- `server/pdf/compile.py` drives the bundled binary. `typst` is never looked up on PATH.
- The panel shows **pages, not the PDF**: a webview has no PDF plugin, so the same document is also rendered to one PNG per page and those are displayed. The PDF is what "Open PDF" opens.

Builds are cached on the document's content hash *and* a fingerprint of the renderer (`template.typ`, `emitter.py`, `compile.py`). Change the template and the next conversion rebuilds rather than serving a PDF the previous template drew.

## Diagrams

Mermaid renders in the webview, because a webview is a browser and the backend is not. The SVG comes back through `postMessage`, Python writes it to a temp file, and the generated Typst references it. Nothing leaves the machine, and there is no Chromium dependency.

Two consequences: mermaid must be configured with `htmlLabels: false` (Typst's SVG support does not render `<foreignObject>`), and any font the SVG names has to exist at compile time.

With the panel closed there is no browser to render in, so the diagram's source is printed instead and the conversion still succeeds.

## Testing

```bash
npm test                  # extension host: node:test over out/src/test/**
npm run test:python       # backend: pytest over server/tests
npm run smoke             # the real thing: spawn, handshake, convert, dispose
```

The smoke harness (`scripts/smoke-host.mjs`) stubs `vscode` at the module loader and drives `activate()` the way the editor does — it is what proves the host path end to end, including that disposal actually kills the child. It needs `npm run fetch-runtimes` first.

What the harness cannot prove: anything rendered. Webviews, the Activity Bar view and the panels need a manual pass in the Extension Development Host.

## Packaging and installing

```bash
vsce ls                             # ALWAYS inspect the file list first
npx @vscode/vsce package --target win32-x64
```

Targets: `win32-x64`, `linux-x64`, `darwin-x64`, `darwin-arm64`. Because a Python interpreter and the Typst binary are bundled, VSIXes are platform-specific and each is published separately; the Marketplace serves the right one.

`.vscodeignore` is load-bearing — source, tests, and the webview's source tree all stay out. Package size is a real concern once the interpreter is in.

**Bump the version before packaging anything you intend to install.** Installing a VSIX over the same version means replacing a directory the running editor holds open, which fails on Windows and can leave a stale record in `extensions.json`. A new version installs alongside, exactly as a Marketplace update does. `scripts/install-standalone.ps1` installs the newest VSIX and repairs that stale record if a previous attempt already left one.

## End-to-end walkthrough

1. <kbd>F5</kbd>, then open a markdown file in the Extension Development Host.
2. **Speckit: Open Dashboard** — the panel has to be open for mermaid to render.
3. **Speckit: Process Current File**. The output channel shows, in order: enrichment, validation, the backend's build, and the written PDF.
4. Check the result: a cover page with the title, executive summary and metadata; a table of contents; diagrams as captioned figures; a glossary appendix.
5. Save the file again unchanged — the log says the PDF was reused. Edit it and save again — it rebuilds.

## When something goes wrong

- **Speckit: Show Extension Logs** first. Both halves log there, the backend's lines prefixed `[backend]`.
- **A PDF looks wrong** — read the generated `.typ`. Its path is in the error when a compile fails, and the build directory is kept in that case.
- **A page preview does not appear** — the log records each preview's path and the URI it was rewritten to. A webview that refuses a local resource says nothing at all, so those two lines are the only evidence.
- **The backend will not start** — a damaged install or a platform build that cannot execute. `npm run fetch-runtimes` restores `bin/`.
- **An orphaned Python process** — it should exit when stdin closes. If one survives, that is a bug worth reporting with the log.
