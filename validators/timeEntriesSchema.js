const pool = require("../db");

const ensureTimeEntriesTable = async () => {
  try {
    // 1️⃣ Create table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS time_entries (
        id SERIAL PRIMARY KEY,
        task_id TEXT NOT NULL,
        user_name TEXT,
        user_dept TEXT,
        user_email TEXT,
        project_name TEXT,
        project_code INTEGER NOT NULL,
        location TEXT,
        remarks TEXT,
        client TEXT,
        entry_date DATE NOT NULL,
        hours INTEGER DEFAULT 0,
        minutes INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 2️⃣ Indexes (critical for performance)
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_time_entries_entry_date
      ON time_entries(entry_date);

      CREATE INDEX IF NOT EXISTS idx_time_entries_user_name
      ON time_entries(user_name);

      CREATE INDEX IF NOT EXISTS idx_time_entries_project_code
      ON time_entries(project_code);

      CREATE INDEX IF NOT EXISTS idx_time_entries_date_created
      ON time_entries(entry_date DESC, created_at DESC);
    `);
 /* 3️⃣ Foreign Key → projects(code) */
    await pool.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'fk_time_entries_project'
          ) THEN
            ALTER TABLE time_entries
            ADD CONSTRAINT fk_time_entries_project
            FOREIGN KEY (project_code)
            REFERENCES projects(code)
            ON DELETE CASCADE;
          END IF;
        END $$;
      `);
  
    console.log("✅ Time entries table & indexes ready");
  } catch (err) {
    console.error("❌ Failed to ensure time_entries table", err);
    throw err;
  }
};

module.exports = { ensureTimeEntriesTable };
