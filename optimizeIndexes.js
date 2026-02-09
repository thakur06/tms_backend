const pool = require("./db");

const ensureIndexes = async () => {
  console.log("🛠️  Ensuring database indexes for scale...");
  try {
    // Users table
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_users_dept ON users(dept);`);

    // Projects table
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);`);

    // Tasks table
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project);`);

    // Time Entries (High volume table)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_time_entries_user_email ON time_entries(user_email);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_time_entries_composite ON time_entries(user_email, entry_date);`);

    console.log("✅ All performance indexes verified");
  } catch (err) {
    console.error("❌ Indexing failed", err);
  }
};

if (require.main === module) {
  ensureIndexes().then(() => process.exit());
}

module.exports = ensureIndexes;
