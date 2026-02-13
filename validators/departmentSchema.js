const pool = require("../db");

const departments = [
  "Controls",
  "Mechanical",
  "Process",
  "Electrical",
  "Project Controls",
  "Document Controls",
  "Business Development",
  "Product Development",
  "IT & OMAI",
  "Procurement",
  "Operations",
  "Others"
];

const ensureDepartmentsTable = async () => {
  try {
    // 1️⃣ Create table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS departments (
        id SERIAL PRIMARY KEY,
        dept_name TEXT UNIQUE NOT NULL
      );
    `);

    // 2️⃣ Check if table is empty
    const checkRes = await pool.query("SELECT COUNT(*) FROM departments");
    if (parseInt(checkRes.rows[0].count) === 0) {
      console.log("🌱 Seeding initial departments...");
      for (const dept of departments) {
        await pool.query(
          "INSERT INTO departments (dept_name) VALUES ($1) ON CONFLICT (dept_name) DO NOTHING",
          [dept]
        );
      }
      console.log("✅ Departments seeded successfully");
    }

    console.log("✅ Departments table ready");
  } catch (err) {
    console.error("❌ Failed to ensure departments table", err);
    throw err;
  }
};

module.exports = { ensureDepartmentsTable };
