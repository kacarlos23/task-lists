const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const { createDatabase } = require("../src/db");
const { createApp } = require("../src/app");

function createTestApp() {
  const db = createDatabase(":memory:");
  db.exec("DELETE FROM tasks; DELETE FROM groups;");
  return createApp(db);
}

test("creates and lists groups", async () => {
  const app = createTestApp();

  const createResponse = await request(app).post("/groups").send({ title: "Noite de filmes" });
  assert.equal(createResponse.status, 201);
  assert.equal(createResponse.body.group.title, "Noite de filmes");

  const listResponse = await request(app).get("/groups");
  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.body.groups.length, 1);
  assert.equal(listResponse.body.groups[0].tasks.length, 0);
});

test("creates, completes, and deletes tasks", async () => {
  const app = createTestApp();

  const groupResponse = await request(app).post("/groups").send({ title: "Classicos" });
  const groupId = groupResponse.body.group.id;

  const taskResponse = await request(app)
    .post(`/groups/${groupId}/tasks`)
    .send({ title: "Casablanca" });
  assert.equal(taskResponse.status, 201);
  assert.equal(taskResponse.body.task.completed, false);

  const taskId = taskResponse.body.task.id;
  const patchResponse = await request(app).patch(`/tasks/${taskId}`).send({ completed: true });
  assert.equal(patchResponse.status, 200);
  assert.equal(patchResponse.body.task.completed, true);

  const deleteResponse = await request(app).delete(`/tasks/${taskId}`);
  assert.equal(deleteResponse.status, 204);

  const listResponse = await request(app).get("/groups");
  assert.equal(listResponse.body.groups[0].tasks.length, 0);
});

test("deletes a group with its tasks", async () => {
  const app = createTestApp();

  const groupResponse = await request(app).post("/groups").send({ title: "Series" });
  const groupId = groupResponse.body.group.id;
  await request(app).post(`/groups/${groupId}/tasks`).send({ title: "The Bear" });

  const deleteResponse = await request(app).delete(`/groups/${groupId}`);
  assert.equal(deleteResponse.status, 204);

  const listResponse = await request(app).get("/groups");
  assert.equal(listResponse.body.groups.length, 0);
});

