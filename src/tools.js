const tools = [
  {
    type: "function",
    function: {
      name: "add_task",
      description: "Add a new task to the to-do list.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "The task title in plain language.",
          },
          due_date: {
            type: "string",
            description:
              "Optional due date like 'tomorrow', '2026-05-06', or 'tonight'.",
          },
        },
        required: ["title"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_tasks",
      description: "List tasks by status.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["all", "pending", "completed"],
            description: "The task status to filter by.",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_task",
      description: "Mark a task as completed using its numeric id.",
      parameters: {
        type: "object",
        properties: {
          task_id: {
            type: "integer",
            description: "The numeric id of the task to complete.",
          },
        },
        required: ["task_id"],
        additionalProperties: false,
      },
    },
  },
];

module.exports = { tools };
