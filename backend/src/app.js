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
        if (!origin || isLocalDevelopmentOrigin(origin) || allowedOrigins.includes(origin)) {
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
    const group = db
      .prepare("SELECT id, title, created_at FROM groups WHERE id = ?")
      .get(result.lastInsertRowid);

    res.status(201).json({
      group: {
        id: group.id,
        title: group.title,
        createdAt: group.created_at,
        tasks: []
      }
    });
  });

  app.delete("/groups/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid group id" });
      return;
    }

    const result = db.prepare("DELETE FROM groups WHERE id = ?").run(id);
    if (result.changes === 0) {
      res.status(404).json({ error: "Group not found" });
      return;
    }

    res.status(204).send();
  });

  app.post("/groups/:groupId/tasks", (req, res) => {
    const groupId = Number(req.params.groupId);
    const title = normalizeTitle(req.body?.title);

    if (!Number.isInteger(groupId)) {
      res.status(400).json({ error: "Invalid group id" });
      return;
    }

    if (!title) {
      res.status(400).json({ error: "Title is required" });
      return;
    }

    const group = db.prepare("SELECT id FROM groups WHERE id = ?").get(groupId);
    if (!group) {
      res.status(404).json({ error: "Group not found" });
      return;
    }

    const result = db
      .prepare("INSERT INTO tasks (group_id, title, completed) VALUES (?, ?, 0)")
      .run(groupId, title);
    const task = db
      .prepare("SELECT id, group_id, title, completed, created_at FROM tasks WHERE id = ?")
      .get(result.lastInsertRowid);

    res.status(201).json({
      task: {
        id: task.id,
        groupId: task.group_id,
        title: task.title,
        completed: Boolean(task.completed),
        createdAt: task.created_at
      }
    });
  });

  app.patch("/tasks/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid task id" });
      return;
    }

    if (typeof req.body?.completed !== "boolean") {
      res.status(400).json({ error: "Completed must be boolean" });
      return;
    }

    const result = db
      .prepare("UPDATE tasks SET completed = ? WHERE id = ?")
      .run(req.body.completed ? 1 : 0, id);
    if (result.changes === 0) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const task = db
      .prepare("SELECT id, group_id, title, completed, created_at FROM tasks WHERE id = ?")
      .get(id);
    res.json({
      task: {
        id: task.id,
        groupId: task.group_id,
        title: task.title,
        completed: Boolean(task.completed),
        createdAt: task.created_at
      }
    });
  });

  app.delete("/tasks/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid task id" });
      return;
    }

    const result = db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
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

function normalizeTitle(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, 160);
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

module.exports = {
  createApp
};
