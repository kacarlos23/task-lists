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

  ensureColumn(db, "groups", "deleted_at", "TEXT");
  ensureColumn(db, "tasks", "due_date", "TEXT");
  ensureColumn(db, "tasks", "deleted_at", "TEXT");
  seedIfEmpty(db);

  return db;
}

function ensureColumn(db, table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  const exists = columns.some((item) => item.name === column);
  if (!exists) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function seedIfEmpty(db) {
  const count = db
    .prepare("SELECT COUNT(*) AS count FROM groups WHERE deleted_at IS NULL")
    .get().count;
  if (count > 0) {
    return;
  }

  const insertGroup = db.prepare("INSERT INTO groups (title) VALUES (?)");
  const insertTask = db.prepare(
    "INSERT INTO tasks (group_id, title, completed, due_date) VALUES (?, ?, ?, ?)"
  );

  const seed = db.transaction(() => {
    const weekend = insertGroup.run("Fim de semana").lastInsertRowid;
    insertTask.run(weekend, "Duna: Parte Dois", 0, null);
    insertTask.run(weekend, "O Menino e a Garca", 0, null);

    const classics = insertGroup.run("Classicos").lastInsertRowid;
    insertTask.run(classics, "O Poderoso Chefao", 1, null);
    insertTask.run(classics, "Cinema Paradiso", 0, null);

    const series = insertGroup.run("Series").lastInsertRowid;
    insertTask.run(series, "The Bear", 0, null);
  });

  seed();
}

function getGroupsWithTasks(db) {
  const rows = db
    .prepare(
      `
      SELECT
        g.id,
        g.title,
        g.created_at,
        COALESCE(
          json_group_array(
            json_object(
              'id', t.id,
              'groupId', t.group_id,
              'title', t.title,
              'completed', CASE WHEN t.completed = 1 THEN json('true') ELSE json('false') END,
              'dueDate', t.due_date,
              'createdAt', t.created_at
            )
          ) FILTER (WHERE t.id IS NOT NULL),
          json('[]')
        ) AS tasks_json
      FROM groups g
      LEFT JOIN tasks t
        ON t.group_id = g.id
       AND t.deleted_at IS NULL
      WHERE g.deleted_at IS NULL
      GROUP BY g.id
      ORDER BY g.created_at ASC, g.id ASC
      `
    )
    .all();

  return rows.map((group) => ({
    id: group.id,
    title: group.title,
    createdAt: group.created_at,
    tasks: JSON.parse(group.tasks_json).sort(compareTasks)
  }));
}

function compareTasks(a, b) {
  const createdAt = String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
  if (createdAt !== 0) {
    return createdAt;
  }
  return Number(a.id) - Number(b.id);
}

module.exports = {
  createDatabase,
  getGroupsWithTasks
};
