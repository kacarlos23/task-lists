const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { createDatabase } = require("../src/db");
const { createApp } = require("../src/app");

function createTestContext() {
  const db = createDatabase(":memory:");
  db.exec("UPDATE tasks SET deleted_at = CURRENT_TIMESTAMP; UPDATE groups SET deleted_at = CURRENT_TIMESTAMP;");
  return { db, app: createApp(db) };
}

test("creates and lists groups", async () => {
  const { app } = createTestContext();

  const createResponse = await request(app).post("/groups").send({ title: "Noite de filmes" });
  assert.equal(createResponse.status, 201);
  assert.equal(createResponse.body.group.title, "Noite de filmes");

  const listResponse = await request(app).get("/groups");
  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.body.groups.length, 1);
  assert.equal(listResponse.body.groups[0].tasks.length, 0);
});

test("updates group titles", async () => {
  const { app } = createTestContext();

  const groupResponse = await request(app).post("/groups").send({ title: "Casa" });
  const groupId = groupResponse.body.group.id;

  const patchResponse = await request(app).patch(`/groups/${groupId}`).send({ title: "Casa nova" });
  assert.equal(patchResponse.status, 200);
  assert.equal(patchResponse.body.group.title, "Casa nova");
});

test("creates and partially updates tasks", async () => {
  const { app } = createTestContext();

  const groupResponse = await request(app).post("/groups").send({ title: "Classicos" });
  const groupId = groupResponse.body.group.id;

  const taskResponse = await request(app)
    .post(`/groups/${groupId}/tasks`)
    .send({ title: "Casablanca", dueDate: "2026-07-10" });
  assert.equal(taskResponse.status, 201);
  assert.equal(taskResponse.body.task.completed, false);
  assert.equal(taskResponse.body.task.dueDate, "2026-07-10");

  const taskId = taskResponse.body.task.id;
  const patchResponse = await request(app)
    .patch(`/tasks/${taskId}`)
    .send({ title: "Casablanca editado", completed: true, dueDate: null });
  assert.equal(patchResponse.status, 200);
  assert.equal(patchResponse.body.task.title, "Casablanca editado");
  assert.equal(patchResponse.body.task.completed, true);
  assert.equal(patchResponse.body.task.dueDate, null);
});

test("soft deletes tasks", async () => {
  const { app, db } = createTestContext();

  const groupResponse = await request(app).post("/groups").send({ title: "Tarefas" });
  const groupId = groupResponse.body.group.id;
  const taskResponse = await request(app)
    .post(`/groups/${groupId}/tasks`)
    .send({ title: "Comprar pao" });
  const taskId = taskResponse.body.task.id;

  const deleteResponse = await request(app).delete(`/tasks/${taskId}`);
  assert.equal(deleteResponse.status, 204);

  const listResponse = await request(app).get("/groups");
  assert.equal(listResponse.body.groups[0].tasks.length, 0);

  const deletedTask = db.prepare("SELECT deleted_at FROM tasks WHERE id = ?").get(taskId);
  assert.ok(deletedTask.deleted_at);
});

test("soft deletes groups with their tasks", async () => {
  const { app, db } = createTestContext();

  const groupResponse = await request(app).post("/groups").send({ title: "Series" });
  const groupId = groupResponse.body.group.id;
  const taskResponse = await request(app).post(`/groups/${groupId}/tasks`).send({ title: "The Bear" });
  const taskId = taskResponse.body.task.id;

  const deleteResponse = await request(app).delete(`/groups/${groupId}`);
  assert.equal(deleteResponse.status, 204);

  const listResponse = await request(app).get("/groups");
  assert.equal(listResponse.body.groups.length, 0);

  const deletedGroup = db.prepare("SELECT deleted_at FROM groups WHERE id = ?").get(groupId);
  const deletedTask = db.prepare("SELECT deleted_at FROM tasks WHERE id = ?").get(taskId);
  assert.ok(deletedGroup.deleted_at);
  assert.ok(deletedTask.deleted_at);
});

