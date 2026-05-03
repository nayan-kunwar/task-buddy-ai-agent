# TaskBuddy

TaskBuddy is a tiny beginner AI agent project. It lets a user chat in plain English to manage a to-do list with only 3 tools:

- `add_task(title, due_date)`
- `list_tasks(status)`
- `complete_task(task_id)`

## What it uses

- Node.js built-in HTTP server
- Static HTML, CSS, and browser JavaScript
- Google Gemini API with OpenAI-compatible chat completions and tool calling
- Local `tasks.json` storage

## Run it

1. Copy `.env.example` to `.env`
2. Add your `GEMINI_API_KEY` from Google AI Studio
3. Start the app:

```powershell
node server.js
```

4. Open `http://localhost:3000`

## Example prompts

- `Add buy groceries tomorrow`
- `Show my pending tasks`
- `Complete task 1`
