const messagesEl = document.getElementById("messages");
const taskListEl = document.getElementById("task-list");
const chatFormEl = document.getElementById("chat-form");
const messageInputEl = document.getElementById("message-input");
const sendButtonEl = document.getElementById("send-button");
const refreshButtonEl = document.getElementById("refresh-button");

const messages = [
  {
    role: "assistant",
    content: "Hi! I can add tasks, show tasks, and complete tasks for you.",
  },
];

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderMessages() {
  messagesEl.innerHTML = messages
    .map(
      (message) => `
        <article class="message message-${message.role}">
          <span class="message-role">${message.role === "assistant" ? "TaskBuddy" : "You"}</span>
          <p>${escapeHtml(message.content)}</p>
        </article>
      `,
    )
    .join("");

  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderTasks(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    taskListEl.innerHTML = `<div class="empty-state">No tasks yet.</div>`;
    return;
  }

  taskListEl.innerHTML = tasks
    .map(
      (task) => `
        <article class="task-card">
          <div class="task-topline">
            <strong>#${task.id}</strong>
            <span class="status status-${task.status}">${escapeHtml(task.status)}</span>
          </div>
          <p class="task-title">${escapeHtml(task.title)}</p>
          <p class="task-meta">Due: ${escapeHtml(task.due_date || "No due date")}</p>
        </article>
      `,
    )
    .join("");
}

async function loadTasks() {
  const response = await fetch("/api/tasks");
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to load tasks.");
  }

  renderTasks(data.tasks);
}

async function sendMessage(messageHistory) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messages: messageHistory }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to send message.");
  }

  return data.reply;
}

function setLoading(isLoading) {
  sendButtonEl.disabled = isLoading;
  messageInputEl.disabled = isLoading;
  sendButtonEl.textContent = isLoading ? "Sending..." : "Send";
}

chatFormEl.addEventListener("submit", async (event) => {
  event.preventDefault();

  const content = messageInputEl.value.trim();

  if (!content) {
    return;
  }

  messages.push({ role: "user", content });
  renderMessages();
  messageInputEl.value = "";
  setLoading(true);

  try {
    const reply = await sendMessage(messages);
    messages.push({ role: "assistant", content: reply });
    renderMessages();
    await loadTasks();
  } catch (error) {
    messages.push({
      role: "assistant",
      content: error instanceof Error ? error.message : "Something went wrong.",
    });
    renderMessages();
  } finally {
    setLoading(false);
    messageInputEl.focus();
  }
});

refreshButtonEl.addEventListener("click", async () => {
  refreshButtonEl.disabled = true;

  try {
    await loadTasks();
  } catch (error) {
    messages.push({
      role: "assistant",
      content: error instanceof Error ? error.message : "Could not refresh tasks.",
    });
    renderMessages();
  } finally {
    refreshButtonEl.disabled = false;
  }
});

renderMessages();
loadTasks().catch(() => {
  renderTasks([]);
});
