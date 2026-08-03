<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan

<!-- SPECKIT PLAN: specs/002-shopping-website/plan.md -->
<!-- SPECKIT END -->


<!-- speckit-auto-ai:progress-tracking:start -->
## Speckit Auto-AI: Live Task Progress Tracking

This project uses the Speckit Auto-AI extension to show a live Kanban board of the tasks in each `tasks.md` file. When you are executing `/speckit.implement` (or otherwise working through a `tasks.md` checklist) and are about to start or finish a specific task:

1. **When you start working on a task** (e.g. `T003`), write a JSON file to `.speckit-auto-ai/progress/<task_key>.json` (creating the `.speckit-auto-ai/progress/` directory if it doesn't exist) with this exact shape:
   ```json
   { "source_path": "<path to the tasks.md file, relative to the repo root>", "task_key": "T003", "status": "in_progress" }
   ```
2. **When you finish that task** (after checking its box, `- [x]`), overwrite the same file with `"status": "done"` instead.

Do this for every task you work on, one file write per task. These files are local-only signals (already gitignored) picked up by the Speckit Auto-AI extension - they are not part of the project's source and should never be referenced elsewhere or committed.
<!-- speckit-auto-ai:progress-tracking:end -->
