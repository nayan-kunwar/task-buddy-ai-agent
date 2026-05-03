# TaskBuddy Architecture

This document explains how the current TaskBuddy project is structured and how data moves through the system.

## System View

TaskBuddy is a small local AI agent application with 3 layers:

1. Browser UI
2. Node.js server
3. Local task storage

It also depends on an external model provider:

- Google Gemini via the OpenAI-compatible chat completions endpoint

## High-Level Diagram

```text
┌─────────────────────┐
│     Browser UI      │
│ index.html + app.js │
└──────────┬──────────┘
           │
           │ HTTP
           │
     ┌─────▼─────┐
     │ server.js │
     │ Node API  │
     └─────┬─────┘
           │
           │ uses
           │
  ┌────────▼────────┐
  │   Agent Loop    │
  │ prompt + tools  │
  └────────┬────────┘
           │
           │ tool calls
           │
   ┌───────▼────────┐
   │ taskStore.js   │
   │ business logic │
   └───────┬────────┘
           │
           │ read/write
           │
     ┌─────▼─────┐
     │ tasks.json│
     └───────────┘

External dependency:

server.js
   ->
Gemini OpenAI-compatible API
```

## Folder Layout

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
  README.md
  ARCHITECTURE.md
```

## Core Components

### 1. Frontend

Files:

- `public/index.html`
- `public/app.js`
- `public/styles.css`

Responsibilities:

- display the chat interface
- display the task list
- collect user input
- send chat messages to the backend
- fetch updated tasks from the backend
- render errors and loading states

The frontend does not directly modify tasks. It always goes through backend APIs.

### 2. HTTP Server

File:

- `server.js`

Responsibilities:

- serve static frontend files
- expose API routes
- prepare model messages
- call Gemini
- detect tool calls
- execute local tool handlers
- return the final assistant response

This file currently contains both routing and agent orchestration logic.

### 3. Tool Definitions

File:

- `src/tools.js`

Responsibilities:

- define which functions the model is allowed to call
- describe each function’s parameters using JSON schema

Current tools:

- `add_task`
- `list_tasks`
- `complete_task`

This file defines the interface for the model, not the implementation.

### 4. Business Logic

File:

- `src/taskStore.js`

Responsibilities:

- create `tasks.json` if missing
- read tasks
- write tasks
- add new tasks
- list tasks by status
- mark a task as completed

This file is the local application logic layer.

### 5. Environment Loader

File:

- `src/env.js`

Responsibilities:

- load `.env` values into `process.env`

Current environment variables:

- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `PORT`

### 6. Persistence

File:

- `tasks.json`

Responsibilities:

- act as the project’s local database

Each task stores:

- `id`
- `title`
- `due_date`
- `status`
- `created_at`
- `completed_at`

## API Design

### `GET /api/tasks`

Purpose:

- return all stored tasks

Used by:

- page load
- refresh button
- refresh after a tool action

Response shape:

```json
{
  "tasks": []
}
```

### `POST /api/chat`

Purpose:

- send chat history to the backend agent

Request shape:

```json
{
  "messages": [
    { "role": "user", "content": "Add buy milk tomorrow" }
  ]
}
```

Response shape:

```json
{
  "reply": "I added your task.",
  "model": "gemini-2.5-flash"
}
```

## Agent Flow

The agent is implemented in `server.js` through the `runAgent()` loop.

### Step-by-step flow

1. The browser sends chat messages to `POST /api/chat`
2. The server sanitizes and trims message history
3. The server prepends the system prompt
4. The server sends messages plus tool definitions to Gemini
5. Gemini either:
   - returns a normal text reply
   - or requests one or more tool calls
6. If a tool is requested, the server:
   - parses tool arguments
   - maps the tool name to a local handler
   - executes the corresponding function
7. The tool result is added back into the conversation
8. The server calls Gemini again
9. Gemini generates the final natural-language response
10. The server returns that response to the frontend

## Tool Execution Model

The mapping between model tool names and local code looks like this:

```text
Gemini tool call
   ->
toolHandlers in server.js
   ->
taskStore.js function
   ->
tasks.json
```

Current mapping:

- `add_task` -> `addTask(title, due_date)`
- `list_tasks` -> `listTasks(status)`
- `complete_task` -> `completeTask(task_id)`

## Sequence Diagram

```text
User
  ->
Browser UI
  -> POST /api/chat
Server
  -> Gemini API with messages + tools
Gemini
  -> tool call: add_task
Server
  -> addTask(...)
taskStore.js
  -> write tasks.json
taskStore.js
  -> result
Server
  -> Gemini API with tool result
Gemini
  -> final reply
Server
  -> Browser UI
Browser UI
  -> GET /api/tasks
Server
  -> tasks.json
Server
  -> updated tasks
Browser UI
  -> render reply + task list
```

## State Management

There are 2 types of state in this project.

### 1. UI state

Stored in memory inside `public/app.js`:

- current chat messages
- loading state
- rendered task list

This state resets on browser refresh.

### 2. Persistent state

Stored in `tasks.json`:

- tasks
- ids
- status
- timestamps

This state survives server restarts.

## Error Handling

Current error handling exists at a few levels:

- invalid or empty request body
- missing `GEMINI_API_KEY`
- Gemini API HTTP errors
- invalid tool JSON arguments
- unsupported tool names
- task id validation errors
- task not found errors

All of these currently surface as JSON API errors, and the frontend displays them as assistant-style messages.

## Design Choices

### Why plain Node HTTP instead of Express?

To keep the project dependency-light and beginner-friendly.

### Why plain frontend instead of React?

To keep the focus on agent architecture instead of frontend framework complexity.

### Why JSON file storage?

To make persistence visible and easy to inspect without extra setup.

### Why only 3 tools?

Because small tool scope makes function-calling behavior easier to understand and debug.

### Why keep the agent loop in `server.js`?

For a small project, this makes the control flow easier to follow in one file.

## Current Limitations

- no authentication
- no multi-user support
- no task editing or deletion
- no database transaction safety
- no persistent chat history
- no server-side logging or tracing
- no automated tests
- no streaming model responses
- `server.js` has multiple responsibilities and would be split in a larger app

## Suggested Future Refactor

If this project grows, a cleaner architecture would be:

```text
src/
  api/
    chatRoute.js
    tasksRoute.js
  agent/
    runAgent.js
    systemPrompt.js
    geminiClient.js
    toolHandlers.js
  storage/
    taskStore.js
  tools/
    taskTools.js
  config/
    env.js
```

That would separate:

- routing
- provider client logic
- agent orchestration
- tool schemas
- business logic
- storage

## Best Way To Read The Code

If you want to understand this project quickly, read files in this order:

1. `README.md`
2. `public/app.js`
3. `server.js`
4. `src/tools.js`
5. `src/taskStore.js`
6. `tasks.json`

That order follows the real request flow from user input to storage update.
