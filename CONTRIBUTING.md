# Contributing

Thanks for taking an interest. This is a small project, so the process is light: open an issue for anything non-trivial before you write code, and keep pull requests focused on one thing.

## Getting set up

You need Docker Desktop, Node.js 20+, Python 3.11+, and VS Code 1.85+. The [README](README.md) covers the one-command setup; [DEVELOPMENT.md](DEVELOPMENT.md) covers running the backend without Docker, every environment variable, and how the pipeline actually works.

```bash
git clone https://github.com/HUNT3Rboii/speckit-docs-agent
cd speckit-docs-agent
```

The repository holds three components that can be worked on independently:

| Directory | What it is | Install |
|---|---|---|
| `backend/` | FastAPI service that validates and renders PDFs | `pip install -r backend/requirements.txt` |
| `vscode-extension/` | The VS Code extension that talks to your IDE's AI | `cd vscode-extension && npm install` |
| `frontend/` | React dashboard for browsing generated artifacts | `cd frontend && npm install` |

## Running the tests

Every pull request runs these in CI, so run whichever ones cover your change first:

```bash
cd backend         && pytest tests/          # backend
cd vscode-extension && npm run test:unit     # extension, pure logic (no VS Code needed)
cd frontend        && npm run test           # dashboard
```

Type checks and linting, also enforced in CI:

```bash
cd vscode-extension && npm run compile && npm run lint
cd frontend         && npx tsc -b --noEmit && npm run lint
```

Extension changes that touch VS Code APIs need a manual pass in the Extension Development Host — see [DEVELOPMENT.md](DEVELOPMENT.md#extension--integration-extension-development-host).

## What a good change looks like

- **One concern per pull request.** Unrelated cleanups make review slower, not faster.
- **Tests for behaviour, not implementation.** Backend tests live beside the code they cover in `backend/tests/{unit,integration}/`; frontend and extension tests sit next to their source file as `*.test.ts(x)`.
- **Match the surrounding style.** No new formatter configs or dependencies without a reason in the pull request description.
- **Comments explain why, not what.** The existing code only comments where a decision would otherwise look arbitrary — follow that.
- **Don't commit generated output.** PDFs, `*.sqlite3` databases, `pdf-output/`, and IDE scaffolding are gitignored on purpose.

## Documentation

If your change alters setup, configuration, or observable behaviour, update the docs in the same pull request:

- [README.md](README.md) — anything a *user* of the extension sees
- [DEVELOPMENT.md](DEVELOPMENT.md) — internals, environment variables, architecture
- [vscode-extension/CHANGELOG.md](vscode-extension/CHANGELOG.md) — user-visible extension changes
- [vscode-extension/TROUBLESHOOTING.md](vscode-extension/TROUBLESHOOTING.md) — new failure modes and their fixes

## Reporting bugs

Include what you did, what you expected, what happened, and the output of `Speckit: Show Extension Logs` — that log is almost always where the answer is. Note your OS, VS Code version, and which AI provider was active.

## Security

Please don't open a public issue for a security problem. Email the maintainer instead, and give a reasonable window for a fix before disclosing.

## License

Contributions are accepted under the [MIT License](LICENSE) that covers this project.
