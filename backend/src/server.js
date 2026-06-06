const { createDatabase } = require("./db");
const { createApp } = require("./app");

const port = Number(process.env.PORT || 4001);
const db = createDatabase();
const app = createApp(db);

app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
});
