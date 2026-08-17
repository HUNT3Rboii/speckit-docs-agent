# CLAUDE.md

Context for Claude Code working in this repository.

## What this is

A VS Code extension with three moving parts that ship together in one VSIX:

1. **Extension host** (TypeScript, Node.js) — activation, commands, process lifecycle, message broker.
2. **Webview UI** (React) — renders in a VS Code editor tab. Built to static assets, loaded from disk.
3. **Python backend** — spawned as a child process by the extension host. Owns all data access.
4. **Local database** — per-user, on-disk, one file. Never a server the user has to install.

There is no cloud service. There is no shared state between users. Everything runs on the
user's machine and dies with the editor.

## Hard constraints

These are not preferences. Violating them breaks the build, the packaging, or the runtime.

- **A VSIX is a zip of files. It cannot contain a database server.** No Postgres install step,
  no Docker requirement, no `pg_ctl`. If a change seems to need one, stop and flag it.
- **The extension host is Node.js. Python cannot run inside it.** All Python runs in the spawned
  child process, reached over the RPC channel — never imported, never called synchronously.
- **The React app must not `fetch()` the Python backend directly.** It has no network permission
  under our CSP, and direct localhost access breaks in Remote SSH / Codespaces where the webview
  and extension host are on different machines. All traffic goes:
  `React → postMessage → extension host → Python → back`.
- **The webview cannot load files by path.** Every local resource URI must go through
  `webview.asWebviewUri()`. A hardcoded `/assets/...` or `./foo.js` will 404 silently.
- **No absolute paths in the home directory.** Persistent state lives under
  `context.globalStorageUri` (per-user) so VS Code cleans it up on uninstall.

## Layout

```
src/                    Extension host (TypeScript)
  extension.ts          activate() / deactivate()
  backend/              Spawn, handshake, shutdown, RPC client
  webview/              Panel creation, HTML generation, message routing
webview-ui/             React app (separate package.json, own build)
  dist/                 Build output — this is what ships
server/                 Python backend
  main.py               Entry point; takes --storage-path and --port|--stdio
  db/                   Schema, migrations, queries
  typst/                Emitter + template.typ
bin/                    Bundled binaries per platform (Python, typst)
resources/              Icons, static assets
```

`webview-ui` builds independently and its `dist/` is copied into the VSIX. It is not part of
the extension's TypeScript compilation.

## Conventions by area

### Extension host

- **Activate lazily.** Use a specific activation event, never `*`. Spawning Python on every
  window open is unacceptable.
- Register everything disposable on `context.subscriptions`, including the child process kill.
- Wait for a readiness signal from Python before sending the first request. Do not assume the
  process is ready on spawn return.
- Storage directories are not guaranteed to exist — `createDirectory` before use.

### Python backend

- Must exit when stdin closes. This is the reliable parent-death signal; `deactivate()` does not
  always run if VS Code is force-killed, and orphaned processes are a known failure mode.
- Takes the storage path as a CLI argument. Never derives its own location.
- Migrations run on startup. The extension can update while a user's DB file is at an older
  schema — this is the normal case, not an edge case.
- Stdout is the RPC channel when running in stdio mode. Log to stderr, never stdout.

### Webview / React

- `acquireVsCodeApi()` is callable exactly once per webview. Wrap it in a module-level singleton.
- Message passing is async with no ordering guarantee. Requests carry an `id`; replies match on it.
  Use the shared request/response helper rather than raw `addEventListener` in components.
- Strict CSP with a nonce on every script tag. No inline handlers, no `eval`, no CDN.
- Theme against VS Code CSS variables (`--vscode-editor-background`, `--vscode-foreground`, etc.).
  Hardcoded colors make the panel look foreign inside the editor.
- **No React Router.** The history API does not work in a webview. Use in-memory routing or
  component state.
- State is destroyed when the tab is hidden. Persist through `vscode.setState()`/`getState()` —
  the router does, so a reopened window returns to the page it was on.
- The dashboard panel nonetheless sets `retainContextWhenHidden: true`, which is the expensive
  option and here the only working one: **mermaid renders in that DOM**, and convert-on-save runs
  while the reader is in a markdown file with the panel in the background. A torn-down webview
  cannot answer `renderMermaid`, so every automatic conversion of a document with diagrams timed
  out. A restored panel (through the serializer) cannot be given that option, so a failed render
  must never be fatal to the conversion.
- `registerWebviewPanelSerializer` is required for the tab to survive an editor restart.

### PDF generation — Typst

The pipeline is:

```
.md → markdown-it-py → AST → generated .typ → `typst compile` → .pdf
```

Typst was chosen over WeasyPrint and reportlab and the choice is closed. It is a
single statically-linked binary per platform, so there is no dynamic library
loading to go wrong on macOS/Windows — the failure mode that ruled out
WeasyPrint's GTK/Pango dependency inside a VSIX. The output is documentation:
table of contents, numbered headings, running headers, captioned figures, tables
that break across pages, highlighted code. Typst expresses all of that
declaratively; reportlab would mean hand-building each one. ~30MB per platform,
which the existing platform-specific packaging already absorbs.

- **Emit Typst markup as text** and write it to a temp file. Do not drive a
  layout API. When output looks wrong we read the `.typ` — that is the point of
  the design.
- **The document template is a separate `.typ` file** the pipeline imports.
  Generated content carries no styling.
- **Invoke the binary as a subprocess**, resolving its path from the bundled
  location. Never assume `typst` is on PATH.
- **Pin the Typst version.** Compiler upgrades are breaking changes.
- **Typst cannot embed PDF.** Vector input must be SVG. Diagrams arrive as SVG
  from the webview, so this holds by construction — but any future vector source
  needs converting first.

### Diagrams

Mermaid renders in the webview, not on the backend. The webview is a browser, so
`mermaid.js` produces SVG there and passes it back through `postMessage`; Python
writes it to a temp file and references it from the generated Typst. This
removes the Chromium/Puppeteer dependency (`mmdc`) and the Kroki API round-trip
— nothing about the user's documents leaves the machine.

Two requirements fall out of Typst consuming that SVG:

- Mermaid must be configured with `htmlLabels: false`. The default emits
  `<foreignObject>` HTML, which Typst's SVG support does not render.
- Fonts referenced by the SVG must exist at compile time. Either restrict
  mermaid's `fontFamily` to a font Typst ships, or bundle the font and pass
  `--font-path`.

## Build and package

```bash
npm run build           # extension host + webview-ui
npm run watch           # dev loop; F5 launches the Extension Development Host
vsce ls                 # ALWAYS inspect the file list before packaging
vsce package --target <platform>
```

Platform targets: `win32-x64`, `linux-x64`, `darwin-x64`, `darwin-arm64`.

Because a standalone Python interpreter and the Typst binary are bundled, VSIXes are
**platform-specific**. Each target is built and published separately; the Marketplace serves the
right one automatically.

`.vscodeignore` is load-bearing. Source, tests, dev dependencies, `node_modules`, and the
webview's source tree must all stay out. Package size is a real concern once the interpreter is
included — check it on every packaging change.

## Open decisions

Do not silently resolve these. Ask.

- **Database engine.** SQLite is the default choice; enable WAL mode, since two VS Code windows
  means two backend processes on one file. If the schema genuinely needs Postgres features
  (JSONB operators, `tsvector`, extensions), `pgserver` is the fallback — but it changes the
  multi-window story to needing a lock file, and needs platform coverage verified.
- **RPC transport.** stdio vs localhost HTTP. If the backend does code analysis (completions,
  diagnostics, hover), switch to LSP with `pygls` + `vscode-languageclient` instead of a bespoke
  protocol — it handles spawn, handshake, and shutdown already.

## Settled decisions

Do not re-open these.

- **PDF engine: Typst.** See above. Not WeasyPrint, not reportlab.
- **Diagrams: mermaid.js in the webview**, returned as SVG. Not `mmdc`, not Kroki.
- **Interpreter: bundled standalone Python.** Not a dependency on `ms-python.python`.

## When making changes

- Changes touching the extension↔Python boundary need the message contract updated on both sides
  in the same commit.
- Adding a Python dependency affects VSIX size on all four platforms. Mention the cost.
- Anything that adds an install step for the user is a design change, not an implementation
  detail. Flag it before writing code.
