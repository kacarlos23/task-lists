const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { getGroupsWithTasks } = require("./db");

function createApp(db) {
  const app = express();

  app.use(express.json());
  app.use(morgan("dev"));
  app.use(
    cors({
      origin(origin, callback) {
        const allowedOrigins = parseOrigins(process.env.CORS_ORIGIN);
        if (
          !origin ||
          isLocalDevelopmentOrigin(origin) ||
          isVercelOrigin(origin) ||
          allowedOrigins.includes(origin)
        ) {
          callback(null, true);
          return;
        }
        callback(new Error("Origin not allowed by CORS"));
      }
    })
  );

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/groups", (_req, res) => {
    res.json({ groups: getGroupsWithTasks(db) });
  });

  app.post("/groups", (req, res) => {
    const title = normalizeTitle(req.body?.title);
    if (!title) {
      res.status(400).json({ error: "Title is required" });
      return;
    }

    const result = db.prepare("INSERT INTO groups (title) VALUES (?)").run(title);
    const group = getGroupById(db, result.lastInsertRowid);

    res.status(201).json({
      group: {
        ...group,
        tasks: []
      }
    });
  });

  app.patch("/groups/:id", (req, res) => {
    const id = parseInteger(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid group id" });
      return;
    }

    const title = normalizeTitle(req.body?.title);
    if (!title) {
      res.status(400).json({ error: "Title is required" });
      return;
    }

    const result = db
      .prepare("UPDATE groups SET title = ? WHERE id = ? AND deleted_at IS NULL")
      .run(title, id);
    if (result.changes === 0) {
      res.status(404).json({ error: "Group not found" });
      return;
    }

    res.json({ group: getGroupById(db, id) });
  });

  app.delete("/groups/:id", (req, res) => {
    const id = parseInteger(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid group id" });
      return;
    }

    const result = db
      .prepare("UPDATE groups SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL")
      .run(id);
    if (result.changes === 0) {
      res.status(404).json({ error: "Group not found" });
      return;
    }

    db.prepare(
      "UPDATE tasks SET deleted_at = CURRENT_TIMESTAMP WHERE group_id = ? AND deleted_at IS NULL"
    ).run(id);

    res.status(204).send();
  });

  app.post("/groups/:groupId/tasks", (req, res) => {
    const groupId = parseInteger(req.params.groupId);
    const title = normalizeTitle(req.body?.title);
    const dueDate = normalizeDueDate(req.body?.dueDate ?? req.body?.due_date);

    if (!groupId) {
      res.status(400).json({ error: "Invalid group id" });
      return;
    }

    if (!title) {
      res.status(400).json({ error: "Title is required" });
      return;
    }

    if (dueDate === false) {
      res.status(400).json({ error: "Invalid due date" });
      return;
    }

    const group = db
      .prepare("SELECT id FROM groups WHERE id = ? AND deleted_at IS NULL")
      .get(groupId);
    if (!group) {
      res.status(404).json({ error: "Group not found" });
      return;
    }

    const result = db
      .prepare("INSERT INTO tasks (group_id, title, completed, due_date) VALUES (?, ?, 0, ?)")
      .run(groupId, title, dueDate);

    res.status(201).json({ task: getTaskById(db, result.lastInsertRowid) });
  });

  app.patch("/tasks/:id", (req, res) => {
    const id = parseInteger(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid task id" });
      return;
    }

    const updates = {};
    if (Object.hasOwn(req.body || {}, "title")) {
      const title = normalizeTitle(req.body.title);
      if (!title) {
        res.status(400).json({ error: "Title is required" });
        return;
      }
      updates.title = title;
    }

    if (Object.hasOwn(req.body || {}, "completed")) {
      if (typeof req.body.completed !== "boolean") {
        res.status(400).json({ error: "Completed must be boolean" });
        return;
      }
      updates.completed = req.body.completed ? 1 : 0;
    }

    if (
      Object.hasOwn(req.body || {}, "dueDate") ||
      Object.hasOwn(req.body || {}, "due_date")
    ) {
      const dueDate = normalizeDueDate(req.body.dueDate ?? req.body.due_date);
      if (dueDate === false) {
        res.status(400).json({ error: "Invalid due date" });
        return;
      }
      updates.due_date = dueDate;
    }

    const fields = Object.keys(updates);
    if (fields.length === 0) {
      res.status(400).json({ error: "No valid fields to update" });
      return;
    }

    const assignments = fields.map((field) => `${field} = ?`).join(", ");
    const result = db
      .prepare(`UPDATE tasks SET ${assignments} WHERE id = ? AND deleted_at IS NULL`)
      .run(...fields.map((field) => updates[field]), id);
    if (result.changes === 0) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    res.json({ task: getTaskById(db, id) });
  });

  app.delete("/tasks/:id", (req, res) => {
    const id = parseInteger(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid task id" });
      return;
    }

    const result = db
      .prepare("UPDATE tasks SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL")
      .run(id);
    if (result.changes === 0) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    res.status(204).send();
  });

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  return app;
}

function getGroupById(db, id) {
  const group = db
    .prepare("SELECT id, title, created_at FROM groups WHERE id = ? AND deleted_at IS NULL")
    .get(id);
  if (!group) {
    return null;
  }
  return {
    id: group.id,
    title: group.title,
    createdAt: group.created_at
  };
}

function getTaskById(db, id) {
  const task = db
    .prepare(
      `
      SELECT id, group_id, title, completed, due_date, created_at
      FROM tasks
      WHERE id = ? AND deleted_at IS NULL
      `
    )
    .get(id);
  if (!task) {
    return null;
  }
  return normalizeTask(task);
}

function normalizeTask(task) {
  return {
    id: task.id,
    groupId: task.group_id,
    title: task.title,
    completed: Boolean(task.completed),
    dueDate: task.due_date,
    createdAt: task.created_at
  };
}

function parseInteger(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeTitle(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, 160);
}

function normalizeDueDate(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return false;
  }
  const date = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== trimmed) {
    return false;
  }
  return trimmed;
}

function parseOrigins(value) {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isLocalDevelopmentOrigin(origin) {
  try {
    const url = new URL(origin);
    return (
      (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
      (url.protocol === "http:" || url.protocol === "https:")
    );
  } catch (_error) {
    return false;
  }
}

function isVercelOrigin(origin) {
  try {
    const url = new URL(origin);
    return url.protocol === "https:" && url.hostname.endsWith(".vercel.app");
  } catch (_error) {
    return false;
  }
}

module.exports = {
  createApp
};
