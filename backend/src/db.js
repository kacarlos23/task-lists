const path = require("node:path");
const fs = require("node:fs");
const Database = require("better-sqlite3");

const defaultDatabasePath = path.join(__dirname, "..", "data", "tasks.db");

function createDatabase(databasePath = process.env.DATABASE_PATH || defaultDatabasePath) {
  const resolvedPath =
    databasePath === ":memory:" ? databasePath : path.resolve(process.cwd(), databasePath);
  if (resolvedPath !== ":memory:") {
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  }

  const db = new Database(resolvedPath);
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
    );
  `);

  seedIfEmpty(db);

  return db;
}

function seedIfEmpty(db) {
  const count = db.prepare("SELECT COUNT(*) AS count FROM groups").get().count;
  if (count > 0) {
    return;
  }

  const insertGroup = db.prepare("INSERT INTO groups (title) VALUES (?)");
  const insertTask = db.prepare("INSERT INTO tasks (group_id, title, completed) VALUES (?, ?, ?)");

  const seed = db.transaction(() => {
    const weekend = insertGroup.run("Fim de semana").lastInsertRowid;
    insertTask.run(weekend, "Duna: Parte Dois", 0);
    insertTask.run(weekend, "O Menino e a Garça", 0);

    const classics = insertGroup.run("Clássicos").lastInsertRowid;
    insertTask.run(classics, "O Poderoso Chefão", 1);
    insertTask.run(classics, "Cinema Paradiso", 0);

    const series = insertGroup.run("Séries").lastInsertRowid;
    insertTask.run(series, "The Bear", 0);
  });

  seed();
}

function getGroupsWithTasks(db) {
  const groups = db
    .prepare("SELECT id, title, created_at FROM groups ORDER BY created_at ASC, id ASC")
    .all();
  const tasks = db
    .prepare("SELECT id, group_id, title, completed, created_at FROM tasks ORDER BY created_at ASC, id ASC")
    .all();

  const tasksByGroup = new Map();
  for (const task of tasks) {
    const normalizedTask = {
      id: task.id,
      groupId: task.group_id,
      title: task.title,
      completed: Boolean(task.completed),
      createdAt: task.created_at
    };
    if (!tasksByGroup.has(task.group_id)) {
      tasksByGroup.set(task.group_id, []);
    }
    tasksByGroup.get(task.group_id).push(normalizedTask);
  }

  return groups.map((group) => ({
    id: group.id,
    title: group.title,
    createdAt: group.created_at,
    tasks: tasksByGroup.get(group.id) || []
  }));
}

module.exports = {
  createDatabase,
  getGroupsWithTasks
};
