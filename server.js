const http = require("http");
const fs = require("fs");
const path = require("path");
const { loadEnvFile } = require("./src/env");
const { tools } = require("./src/tools");
const {
  addTask,
  listTasks,
  completeTask,
  readTasks,
} = require("./src/taskStore");

loadEnvFile();

const PORT = Number(process.env.PORT || 3000);
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const PUBLIC_DIR = path.join(__dirname, "public");
// Prevents the model from getting stuck in an endless tool-calling loop.
const MAX_TOOL_ROUNDS = 3;
const GEMINI_OPENAI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai";
const DEBUG_LOGS = process.env.DEBUG === "true";

// Maps the tool name the model sees to the real JavaScript function we run locally.
const toolHandlers = {
  add_task: ({ title, due_date }) => addTask(title, due_date ?? null),
  list_tasks: ({ status }) => listTasks(status ?? "all"),
  complete_task: ({ task_id }) => completeTask(task_id),
};

// The system prompt is the agent's operating instruction.
const systemPrompt = [
  "You are TaskBuddy, a beginner-friendly to-do assistant.",
  "Help the user manage tasks using the provided tools.",
  "Only use tools for task operations.",
  "Never invent task ids or claim a task changed unless a tool confirms it.",
  "Keep replies short, clear, and friendly.",
  "If the user is just chatting and does not want a task action, reply normally without tools.",
].join(" ");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
};

function log(level, message, details) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level}] ${message}`;

  if (details === undefined) {
    console.log(prefix);
    return;
  }

  console.log(prefix, details);
}

function debugLog(message, details) {
  if (!DEBUG_LOGS) {
    return;
  }

  log("DEBUG", message, details);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let raw = "";

    request.on("data", (chunk) => {
      raw += chunk;

      if (raw.length > 1_000_000) {
        reject(new Error("Request body is too large."));
        request.destroy();
      }
    });

    request.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });

    request.on("error", reject);
  });
}

async function callGemini(messages) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      "Missing GEMINI_API_KEY. Add it to your environment or .env file.",
    );
  }

  // We use Gemini's OpenAI-compatible endpoint so the request looks like
  // standard chat completions with tools.
  debugLog("Calling Gemini", {
    model: MODEL,
    messageCount: messages.length,
  });

  const apiResponse = await fetch(
    `${GEMINI_OPENAI_BASE_URL}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GEMINI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        tools,
        tool_choice: "auto",
      }),
    },
  );

  if (!apiResponse.ok) {
    const errorText = await apiResponse.text();
    log("ERROR", "Gemini API request failed", {
      status: apiResponse.status,
      body: errorText,
    });
    throw new Error(`Gemini API error: ${apiResponse.status} ${errorText}`);
  }

  debugLog("Gemini API request completed successfully");
  return apiResponse.json();
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  // Keep only clean user/assistant text messages and trim long history.
  return messages
    .filter((message) => message && typeof message.content === "string")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content.trim(),
    }))
    .filter((message) => message.content.length > 0)
    .slice(-12);
}

function formatToolResult(result) {
  return JSON.stringify(result);
}

async function runAgent(userMessages) {
  const messages = [{ role: "system", content: systemPrompt }, ...userMessages];

  log("INFO", "Agent run started", {
    userMessageCount: userMessages.length,
  });

  // This is the core agent loop:
  // 1. Send messages + tools to Gemini
  // 2. If Gemini asks for a tool, run it locally
  // 3. Send the tool result back to Gemini
  // 4. Stop when Gemini returns a normal text reply
  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    console.log("inside  loop");
    debugLog("Agent round started", {
      round: round + 1,
      maxRounds: MAX_TOOL_ROUNDS,
    });

    const completion = await callGemini(messages);
    const assistantMessage = completion.choices?.[0]?.message;
    console.log("First message: ", assistantMessage); // {content, role} or {role, tool_calls: [{function: {name, arguments}, id}]}

    if (!assistantMessage) {
      log("ERROR", "Gemini returned no assistant message");
      throw new Error("No assistant message returned by the model.");
    }

    messages.push({
      role: "assistant",
      content: assistantMessage.content || "",
      tool_calls: assistantMessage.tool_calls,
    });

    // If no tool was requested, the model is done and this is the final reply.
    // {content, role} no tool_calls means the model is done and is giving a final reply to the user.
    if (
      !assistantMessage.tool_calls ||
      assistantMessage.tool_calls.length === 0
    ) {
      log("INFO", "Agent completed without further tool calls", {
        finalReplyLength: (assistantMessage.content || "").length,
      });
      return {
        reply: assistantMessage.content || "I could not generate a response.",
        model: completion.model,
      };
    }

    log("INFO", "Gemini requested tool calls", {
      toolCallCount: assistantMessage.tool_calls.length,
    });

    for (const toolCall of assistantMessage.tool_calls) {
      // tool_calls: []
      const toolName = toolCall.function?.name;
      const rawArgs = toolCall.function?.arguments || "{}";
      const toolHandler = toolHandlers[toolName];

      if (!toolHandler) {
        log("ERROR", "Unsupported tool requested", { toolName });
        throw new Error(`Unsupported tool: ${toolName}`);
      }

      let parsedArgs;
      try {
        parsedArgs = JSON.parse(rawArgs);
      } catch {
        log("ERROR", "Tool arguments were not valid JSON", {
          toolName,
          rawArgs,
        });
        throw new Error(`Tool arguments for ${toolName} were not valid JSON.`);
      }

      debugLog("Executing tool", {
        toolName,
        args: parsedArgs,
      });

      // Execute the real local task function.
      const result = toolHandler(parsedArgs);

      debugLog("Tool execution completed", {
        toolName,
        result,
      });

      // Add the tool result back into the conversation so Gemini can use it
      // to produce the final user-facing answer.
      messages.push({
        role: "tool",
        name: toolName,
        tool_call_id: toolCall.id,
        content: formatToolResult(result),
      });
    }
  }

  log("ERROR", "Agent exceeded max tool rounds", {
    maxRounds: MAX_TOOL_ROUNDS,
  });
  throw new Error("The agent exceeded the maximum tool-call rounds.");
}

function serveStaticFile(requestPath, response) {
  const cleanPath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = path.join(PUBLIC_DIR, cleanPath);
  const normalizedPath = path.normalize(filePath);

  if (!normalizedPath.startsWith(PUBLIC_DIR)) {
    sendJson(response, 403, { error: "Forbidden." });
    return;
  }

  fs.readFile(normalizedPath, (error, fileContent) => {
    if (error) {
      if (error.code === "ENOENT") {
        sendJson(response, 404, { error: "Not found." });
        return;
      }

      sendJson(response, 500, { error: "Failed to load file." });
      return;
    }

    const extension = path.extname(normalizedPath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
    });
    response.end(fileContent);
  });
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    debugLog("Incoming request", {
      method: request.method,
      path: url.pathname,
    });

    if (request.method === "GET" && url.pathname === "/api/tasks") {
      debugLog("Returning tasks list");
      sendJson(response, 200, { tasks: readTasks() });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/chat") {
      const body = await readBody(request);
      const messages = sanitizeMessages(body.messages);

      if (messages.length === 0) {
        log("WARN", "Chat request rejected because it had no usable messages");
        sendJson(response, 400, { error: "Please send at least one message." });
        return;
      }

      console.log("message: ", messages);
      // This is the main entry point into the agent from the frontend.
      const agentResult = await runAgent(messages);
      sendJson(response, 200, {
        reply: agentResult.reply,
        model: agentResult.model,
      });
      return;
    }

    if (request.method === "GET") {
      serveStaticFile(url.pathname, response);
      return;
    }

    sendJson(response, 404, { error: "Not found." });
  } catch (error) {
    log("ERROR", "Request failed", {
      message:
        error instanceof Error ? error.message : "Unexpected server error.",
    });
    sendJson(response, 500, {
      error:
        error instanceof Error ? error.message : "Unexpected server error.",
    });
  }
});

server.listen(PORT, () => {
  log("INFO", `TaskBuddy is running at http://localhost:${PORT}`, {
    model: MODEL,
    debugLogs: DEBUG_LOGS,
  });
});
