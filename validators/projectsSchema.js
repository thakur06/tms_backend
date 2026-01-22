const pool = require("../db");

const ensureProjectsTable = async () => {
  try {
    // 1️⃣ Create table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        code SERIAL NOT NULL,
        location TEXT NOT NULL,
        client TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'project',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 2️⃣ Indexes
    // UNIQUE already creates index, but explicit clarity
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_projects_code
      ON projects(code);
    `);

    console.log("✅ Projects table & indexes ready");
  } catch (err) {
    console.error("❌ Failed to ensure projects table", err);
    throw err;
  }
};

module.exports = { ensureProjectsTable };
