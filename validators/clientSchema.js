const pool = require("../db");

const ensureClientsTable = async () => {
  try {
    // 1️⃣ Create departments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE
      );
    `);

    console.log("✅ Departments table  ready");
  } catch (err) {
    console.error("❌ Failed to ensure departments table", err);
    throw err;
  }
};

module.exports = { ensureClientsTable };
