# Speckit Auto-AI

Turn your markdown into polished PDF documentation, automatically, every time you save.

![Version](https://img.shields.io/badge/version-0.1.0-blue)
![License](https://img.shields.io/badge/license-MIT-orange)

Save a `.md` file in VS Code and you get back a professional PDF — cover page, table of contents, Mermaid diagrams, and a glossary — built by whatever AI is already running in your editor. Every diagram and glossary entry has to quote your actual document to make it into the PDF, so nothing invented ends up in there.

## What you need

| | |
|---|---|
| [Docker Desktop](https://docs.docker.com/desktop/) | Runs the backend |
| [Node.js 20+](https://nodejs.org/) | Builds the extension and dashboard |
| [VS Code 1.85+](https://code.visualstudio.com/) | Where you work |
| An AI provider | GitHub Copilot, Claude, or any model already active in VS Code. You can also point it at your own OpenAI-compatible endpoint (Ollama, etc). Without one, see [No AI provider](#no-ai-provider) |

## Setup

**No configuration required.** The defaults already agree with each other.

```powershell
git clone <your-repo-url> speckit-docs-agent
cd speckit-docs-agent
.\START-EVERYTHING.ps1      # backend on :8000, dashboard on :5173
.\INSTALL-EXTENSION.ps1     # builds and installs the VS Code extension
```

Then reload VS Code: `Ctrl+Shift+P` → **Developer: Reload Window**.

That's it. Save any markdown file and a PDF appears.

> `INSTALL-EXTENSION.ps1` needs the `code` command on your PATH. If it's missing: `Ctrl+Shift+P` → "Shell Command: Install 'code' command in PATH".

## Using it

Save a `.md` file. A few seconds later you get a notification with an **Open PDF** button.

Behind that: the extension reads your file, asks your AI to structure it, and sends the result to the backend, which checks every diagram and glossary claim against your original text before rendering. If a claim isn't backed by your document, the AI is asked to correct it; if it still can't, that item is dropped and the notification tells you which.

Your PDFs are also in `pdf-output/` at the repo root, and browsable in the dashboard at **http://localhost:5173**.

### Converting files by hand

Not every project wants a PDF on every save. In the dashboard sidebar, each project has an **Auto transform** switch. Turn it off and saving stops converting anything for that project — the other projects are unaffected.

You then convert files when you want to, from the project's **Context Files** page in the sidebar (next to Artifacts and Board). It lists every `.md` in the project, converted or not, with two buttons on each: **Transform to PDF** runs that file through the same pipeline a save would, and the eye icon adds it to the **Exceptions** list so it's never converted.

The list comes from the extension, so VS Code needs to be open on that project for it to fill in. Pressing Transform queues the file — the extension picks it up within about 15 seconds and the row updates as it goes.

### Commands

`Ctrl+Shift+P`, then:

| Command | What it does |
|---------|--------------|
| `Speckit: Process Current File` | Process the open file now |
| `Speckit: Show Extension Logs` | See what happened, in detail |
| `Speckit: Check Backend Status` | Confirm the backend is reachable |
| `Speckit: Toggle Auto-Processing` | Stop/start processing on save |
| `Speckit: Manage AI Providers` | Add custom models, reorder which is tried first |

### Settings

`Ctrl+,` → search "Speckit". The ones worth knowing:

| Setting | Default | What it's for |
|---------|---------|---------------|
| `speckit.autoProcess` | `true` | Watch for saves at all. Turn off to only run the command manually — for a single project, prefer the dashboard's Auto transform switch |
| `speckit.includePatterns` | `["**/*.md"]` | Which files to process |
| `speckit.excludePatterns` | *(node_modules, .git, …)* | Which to skip |
| `speckit.allowRuleBasedFallback` | `false` | Produce a plain PDF when no AI is available, instead of an error |
| `speckit.providerPriority` | Copilot first | Which AI is tried first — easiest to set via "Speckit: Manage AI Providers" |
| `speckit.enableDebugLogging` | `false` | Verbose logs when something needs diagnosing |

The remaining settings (`backendUrl`, `apiKey`, `debounceMs`, `maxConcurrentProcessing`, `preferredModelId`, `customModels`, `enableCopilotProgressTracking`) only matter if you're changing where the backend runs or how it's reached — see the [development guide](DEVELOPMENT.md#environment-variables).

## Troubleshooting

### Nothing happens when I save

1. Check the project's **Auto transform** switch in the dashboard sidebar — with it off, saving is meant to do nothing, and you convert from the **Context Files** page instead
2. Check `speckit.autoProcess` is on, and that your file matches `speckit.includePatterns`
3. Check the file isn't on the project's **Exceptions** list
4. Run `Speckit: Show Extension Logs` — every run is logged there
5. Try `Speckit: Process Current File` to rule out the file watcher

### "Backend is not available"

Make sure it's running: `curl http://localhost:8000/health` should return `{"status":"ok",...}`. If not, `.\START-EVERYTHING.ps1` again and check Docker Desktop is up.

### Extension seems out of date after installing

Installing a new build doesn't replace an already-running extension. Run `Developer: Reload Window` in **every** VS Code window you process files from.

### No AI provider

By default, processing fails with an explanation rather than quietly producing an empty-looking PDF. Either install GitHub Copilot or Claude (then reload the window), add your own endpoint via `Speckit: Manage AI Providers`, or set `speckit.allowRuleBasedFallback` to `true` to accept a plain PDF with no diagrams or glossary.

### A diagram or glossary term is missing

That's the evidence check doing its job — anything the AI couldn't back with a quote from your document gets dropped rather than printed. The notification names what went missing.

### Still stuck

`vscode-extension/TROUBLESHOOTING.md` goes deeper, and `Speckit: Show Extension Logs` is almost always where the answer is.

## Working on the code

Architecture, configuration reference, project layout, tests, and running the backend without Docker: **[DEVELOPMENT.md](DEVELOPMENT.md)**.
