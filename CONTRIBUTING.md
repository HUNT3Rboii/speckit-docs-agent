# Contributing

Thanks for taking an interest. This is a small project, so the process is light: open an issue for anything non-trivial before you write code, and keep pull requests focused on one thing.

## Getting set up

You need Node.js 22+, Python 3.11+, and VS Code 1.90+. Node 22 rather than 20 because `npm test` hands a glob to `node --test`, which only expands one from Node 21 onwards. Nothing else — no Docker, no database, no API key. The extension bundles its own Python interpreter and its own typesetter.

```bash
git clone https://github.com/HUNT3Rboii/speckit-docs-agent
cd speckit-docs-agent
npm install
npm --prefix webview-ui install
npm run fetch-runtimes    # bundled Python + typst for your platform
npm run vendor-deps       # the backend's Python dependencies, into server/vendor
npm run build
```

Press <kbd>F5</kbd> to launch an Extension Development Host with the extension loaded from source. [DEVELOPMENT.md](DEVELOPMENT.md) covers the architecture and the day-to-day loop.

Three parts ship together in one VSIX:

| Directory | What it is |
|---|---|
| `src/` | Extension host (TypeScript, Node): activation, commands, process lifecycle, message broker |
| `webview-ui/` | React dashboard, built to static assets and loaded from disk by the panel |
| `server/` | Python backend, spawned as a child process; owns all data access |

`shared/protocol.ts` is the message contract between the first two, and `server/api.py` the RPC surface of the third.

## Running the tests

Every pull request runs these in CI, so run whichever ones cover your change first:

```bash
npm test                  # extension host, node:test (compiles first)
npm run test:python       # backend, pytest
npm run smoke             # spawns the real backend and builds a real PDF
```

The smoke harness needs the bundled runtimes, so run `npm run fetch-runtimes` before it. Changes touching VS Code APIs also need a manual pass in the Extension Development Host — a webview or an Activity Bar view cannot be proven headlessly.

## What a good change looks like

- **One concern per pull request.** Unrelated cleanups make review slower, not faster.
- **Tests for behaviour, not implementation.** Backend tests live in `server/tests/`; host tests in `src/test/`; webview tests sit next to their source file as `*.test.tsx`.
- **Both sides of a boundary in one commit.** A change to the extension↔Python contract that updates only one half is a broken build for whoever pulls next.
- **Match the surrounding style.** No new formatter configs or dependencies without a reason in the pull request description.
- **Comments explain why, not what.** The existing code only comments where a decision would otherwise look arbitrary — follow that.
- **Mind the VSIX.** A new Python dependency ships on all four platforms; run `vsce ls` before packaging changes.
- **Don't commit generated output.** PDFs, `*.sqlite3` databases, `pdf-output/`, `out/`, and IDE scaffolding are gitignored on purpose.

## Documentation

If your change alters setup, configuration, or observable behaviour, update the docs in the same pull request:

- [README.md](README.md) — anything a *user* of the extension sees
- [DEVELOPMENT.md](DEVELOPMENT.md) — architecture, the build, and how the pipeline works
- [CHANGELOG.md](CHANGELOG.md) — user-visible changes, under the next version
- [CLAUDE.md](CLAUDE.md) — constraints that a coding agent working here has to know

## Reporting bugs

Include what you did, what you expected, what happened, and the output of `Colophon: Show Extension Logs` — that log is almost always where the answer is. Note your OS, VS Code version, and which AI provider was active.

## Security

Please don't open a public issue for a security problem. Email the maintainer instead, and give a reasonable window for a fix before disclosing.

## License

Contributions are accepted under the [MIT License](LICENSE) that covers this project.
