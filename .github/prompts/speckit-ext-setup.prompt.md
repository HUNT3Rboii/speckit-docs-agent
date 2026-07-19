---
name: speckit.ext.setup
description: Configure the backend connection for the Documentation Agent extension
tags: [setup, configuration, docs-agent]
---

# Configure Documentation Agent Backend

You are helping set up the Documentation Agent extension for this Spec Kit workspace.

## Task

Configure the backend connection by:

1. **Prompt the user** for the API base URL (default: `http://localhost:8000`)
2. **Prompt the user** for the shared backend API key (default: `dev-key`)
3. **Write the configuration** to the extension config file at `.specify/extensions/docs-agent/config.yml`:
   ```yaml
   api_base_url: "<user_provided_url>"
   api_key: "<user_provided_key>"
   ```
4. **Register the project** with the backend:
   - Make a POST request to `<api_base_url>/api/projects`
   - Headers: `Authorization: Bearer <api_key>`, `Content-Type: application/json`
   - Body: `{"name": "<workspace_name>", "repo_url": null}`
5. **Confirm success** to the user with the project ID

## Configuration File Location

- Workspace: `.specify/extensions/docs-agent/config.yml`
- Template: `.specify/extensions/docs-agent/config-template.yml`

## API Endpoint

```
POST <api_base_url>/api/projects
Authorization: Bearer <api_key>
Content-Type: application/json

{
  "name": "workspace-name",
  "repo_url": null
}
```

## Error Handling

- If the backend is not reachable, inform the user to start the backend services
- If authentication fails, verify the API key is correct
- If the project already exists, that's fine - just confirm the connection works
