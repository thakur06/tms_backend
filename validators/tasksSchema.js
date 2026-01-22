const pool = require("../db");
const ensureTasksTable = async () => {
    try {
        await pool.query(`
        CREATE TABLE IF NOT EXISTS tasks (
          task_id SERIAL PRIMARY KEY,
          task_name TEXT NOT NULL,
          task_dept TEXT
        );
      `);

        console.log("✅ Tasks table ready (created if not existed)");
    } catch (err) {
        console.error("❌ Failed to ensure tasks table", err);
        throw err;
    }
};
module.exports={ensureTasksTable}