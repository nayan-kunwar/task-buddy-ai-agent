# TaskBuddy

TaskBuddy is a small beginner AI agent project. It lets a user manage a to-do list in plain English through a chat UI.

The project is intentionally simple:

- no framework-heavy frontend
- no database server
- only 3 agent tools
- one small Node.js backend

## What This Project Does

The user can type messages like:

- `Add buy groceries tomorrow`
- `Show my pending tasks`
- `Complete task 1`

The AI agent decides whether it should:

- add a task
- list tasks
- complete a task

It does this by using Gemini tool calling through Google's OpenAI-compatible chat completions endpoint.

## Architecture Overview

The project has 4 main parts:

1. `public/` for the browser UI
2. `server.js` for the HTTP server and agent loop
3. `src/tools.js` and `src/taskStore.js` for tool definitions and business logic
4. `tasks.json` for persistence

High-level flow:

```text
Browser UI
   ->
POST /api/chat
   ->
Node server builds prompt + sends tools to Gemini
   ->
Gemini decides: reply normally or call a tool
   ->
Local JS function runs
   ->
tasks.json is updated/read
   ->
Tool result goes back to Gemini
   ->
Final reply returns to browser
```

## Project Structure

```text
ai-agent/
  public/
    index.html
    app.js
    styles.css
  src/
    env.js
    taskStore.js
    tools.js
  server.js
  tasks.json
  .env.example
  package.json
```

## Frontend Architecture

The frontend is plain HTML, CSS, and browser JavaScript.

### `public/index.html`

This is the UI shell. It contains:

- the app title
- the chat area
- the message input
- the task list panel

### `public/app.js`

This file controls the browser behavior.

Main responsibilities:

- keep chat messages in memory
- render messages into the page
- call `POST /api/chat`
- call `GET /api/tasks`
- refresh the task panel after each AI response
- show loading and basic error states

Important idea:

The frontend does not know how to add or complete tasks directly. It only sends messages to the backend and renders the backend response.

## Backend Architecture

The backend is a single Node.js HTTP server in `server.js`.

It handles 3 jobs:

1. serve static frontend files
2. expose API routes
3. run the AI agent loop

### API routes

#### `GET /api/tasks`

Returns the current task list from `tasks.json`.

Used by:

- initial page load
- refresh button
- refresh after chat actions

#### `POST /api/chat`

Accepts the conversation messages from the browser.

The backend then:

1. sanitizes the messages
2. adds the system prompt
3. sends the prompt and tool definitions to Gemini
4. checks whether Gemini requested a tool
5. runs the local tool if needed
6. sends the tool result back to Gemini
7. returns the final natural-language reply

## Agent Architecture

This is the heart of the project.

The agent is not a separate service. It is a loop inside `server.js`.

### System prompt

The system prompt tells the model:

- it is a to-do assistant
- it should use tools for task actions
- it should not invent task ids
- it should keep replies short

### Tool calling flow

The server sends Gemini:

- the current conversation
- the tool schema from `src/tools.js`

Gemini can then:

- answer directly
- or return one or more tool calls

When a tool call appears:

1. the backend reads the tool name
2. parses the JSON arguments
3. maps the tool name to a local handler
4. runs the handler
5. sends the result back as a tool message
6. asks Gemini for the final user-facing reply

This loop is implemented in `runAgent()` and limited by `MAX_TOOL_ROUNDS = 3`.

That limit prevents the agent from looping forever.

## Tool Layer

### `src/tools.js`

This file defines the 3 tools the model is allowed to use:

- `add_task`
- `list_tasks`
- `complete_task`

These are only schemas, not real implementations.

Their purpose is to tell the model:

- tool name
- description
- accepted parameters
- required fields

This is the contract between the model and your local code.

## Business Logic Layer

### `src/taskStore.js`

This file contains the actual task logic.

It is responsible for:

- creating `tasks.json` if it does not exist
- reading tasks from disk
- writing tasks to disk
- adding a task
- listing tasks
- completing a task

This separation is important:

- `tools.js` describes what the AI may call
- `taskStore.js` performs the real work

## Data Storage

### `tasks.json`

This project uses a JSON file as its database.

Each task contains fields like:

- `id`
- `title`
- `due_date`
- `status`
- `created_at`
- `completed_at`

Why this is good for a beginner project:

- easy to inspect manually
- no database setup
- easy to understand read/write flow

Tradeoff:

- not suitable for multi-user production apps
- no concurrency protection
- no advanced querying

## Environment Loading

### `src/env.js`

This is a tiny custom env loader.

It reads `.env` and loads values into `process.env`.

Used values:

- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `PORT`

This keeps the project dependency-light because it avoids adding `dotenv`.

## Request Lifecycle

Here is the full lifecycle for a message like `Add buy milk tomorrow`:

1. User types the message in the browser
2. `public/app.js` pushes it into the local message array
3. The browser sends all messages to `POST /api/chat`
4. `server.js` sanitizes the message history
5. The server sends the prompt and tool definitions to Gemini
6. Gemini chooses `add_task`
7. The backend calls `addTask(title, dueDate)`
8. `src/taskStore.js` writes the new task into `tasks.json`
9. The backend sends the tool result back to Gemini
10. Gemini generates a friendly final reply
11. The backend returns that reply to the browser
12. The browser refreshes the task list with `GET /api/tasks`

## Why This Architecture Is Good For Learning

This architecture teaches the core pieces of a real AI agent without too much complexity:

- prompt + tool schema
- model decision making
- local tool execution
- persistence
- frontend/backend separation

It is not a toy in the sense that the model is actually controlling real functions.

But it is still small enough to understand in one sitting.

## Current Design Decisions

### Why plain JavaScript instead of React?

Because the goal is to learn agent architecture first, not frontend tooling.

### Why JSON file instead of a database?

Because the project is single-user and local-first.

### Why only 3 tools?

Because a smaller toolset makes tool-calling behavior easier to debug and understand.

### Why Gemini through OpenAI-compatible chat completions?

Because it lets the project use a familiar tool-calling message format while running on Gemini.

## Limitations

Current limitations of the architecture:

- no user authentication
- no persistent conversation memory across restarts
- no task editing or deleting
- no database locking
- no tests yet
- no streaming responses
- frontend state resets on page refresh except for saved tasks

## How To Run

1. Copy `.env.example` to `.env`
2. Add your `GEMINI_API_KEY`
3. Optionally set `GEMINI_MODEL=gemini-2.5-flash`
4. Start the server:

```powershell
node server.js
```

5. Open `http://localhost:3000`

## Good Next Improvements

If you want to make this architecture more real-world, the next good steps are:

- add task edit and delete tools
- add SQLite instead of `tasks.json`
- add request logging
- add unit tests for `taskStore.js`
- add chat history persistence
- add streaming model responses
- split `server.js` into routes, agent, and API client modules
