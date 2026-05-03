const fs = require("fs");
const path = require("path");

const TASKS_FILE = path.join(__dirname, "..", "tasks.json");

function ensureTasksFile() {
  if (!fs.existsSync(TASKS_FILE)) {
    fs.writeFileSync(TASKS_FILE, "[]\n", "utf8");
  }
}

function readTasks() {
  ensureTasksFile();
  const raw = fs.readFileSync(TASKS_FILE, "utf8");

  try {
    const tasks = JSON.parse(raw);
    return Array.isArray(tasks) ? tasks : [];
  } catch {
    return [];
  }
}

function writeTasks(tasks) {
  fs.writeFileSync(TASKS_FILE, `${JSON.stringify(tasks, null, 2)}\n`, "utf8");
}

function addTask(title, dueDate) {
  const cleanTitle = String(title || "").trim();

  if (!cleanTitle) {
    throw new Error("Task title is required.");
  }

  const tasks = readTasks();
  const nextId =
    tasks.length === 0 ? 1 : Math.max(...tasks.map((task) => task.id)) + 1;

  const task = {
    id: nextId,
    title: cleanTitle,
    due_date: dueDate ? String(dueDate).trim() : null,
    status: "pending",
    created_at: new Date().toISOString(),
  };

  tasks.push(task);
  writeTasks(tasks);

  return {
    message: "Task added successfully.",
    task,
  };
}

function listTasks(status = "all") {
  const normalizedStatus = String(status || "all").toLowerCase();
  const tasks = readTasks();

  const filteredTasks =
    normalizedStatus === "all"
      ? tasks
      : tasks.filter((task) => task.status.toLowerCase() === normalizedStatus);

  return {
    status: normalizedStatus,
    count: filteredTasks.length,
    tasks: filteredTasks,
  };
}

function completeTask(taskId) {
  const numericTaskId = Number(taskId);

  if (!Number.isInteger(numericTaskId)) {
    throw new Error("Task id must be a whole number.");
  }

  const tasks = readTasks();
  const task = tasks.find((item) => item.id === numericTaskId);

  if (!task) {
    throw new Error(`Task ${numericTaskId} was not found.`);
  }

  task.status = "completed";
  task.completed_at = new Date().toISOString();
  writeTasks(tasks);

  return {
    message: "Task marked as completed.",
    task,
  };
}

module.exports = {
  addTask,
  completeTask,
  listTasks,
  readTasks,
  writeTasks,
};
