const pool = require("../db");

const ensureDeptTable = async () => {
  try {
    // 1️⃣ Create departments table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS departments (
        dept_id SERIAL PRIMARY KEY,
        dept_name TEXT NOT NULL UNIQUE
      );
    `);

    // 2️⃣ Create index (UNIQUE already creates index, but explicit clarity)
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_departments_dept_name
      ON departments(dept_name);
    `);

    console.log("✅ Departments table & index ready");
  } catch (err) {
    console.error("❌ Failed to ensure departments table", err);
    throw err;
  }
};

module.exports = { ensureDeptTable };
