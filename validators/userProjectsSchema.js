const pool = require("../db");

const ensureUserProjectsTable = async () => {
  try {
    // 1️⃣ Create table with proper constraints
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_projects (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        allocation_percentage INTEGER NOT NULL CHECK (allocation_percentage >= 0 AND allocation_percentage <= 100),
        start_date DATE NOT NULL DEFAULT CURRENT_DATE,
        end_date DATE NOT NULL DEFAULT '9999-12-31',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Ensure columns exist (for existing tables)
    await pool.query(`
      ALTER TABLE user_projects 
      ADD COLUMN IF NOT EXISTS allocation_percentage INTEGER NOT NULL DEFAULT 100,
      ADD COLUMN IF NOT EXISTS start_date DATE NOT NULL DEFAULT CURRENT_DATE,
      ADD COLUMN IF NOT EXISTS end_date DATE NOT NULL DEFAULT '9999-12-31';
    `);

    // Ensure check constraint exists for allocation_percentage
    try {
      await pool.query(`
        ALTER TABLE user_projects 
        ADD CONSTRAINT user_projects_allocation_percentage_check 
        CHECK (allocation_percentage >= 0 AND allocation_percentage <= 100);
      `);
    } catch (e) {
      // Ignore if constraint already exists
    }

    // Remove old unique constraint if it exists
    await pool.query(`
      ALTER TABLE user_projects 
      DROP CONSTRAINT IF EXISTS user_projects_user_id_project_id_key;
    `);

    // 2️⃣ Create indexes for performance (scalability)
    // Index on user_id for fast lookups by user
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_projects_user_id
      ON user_projects(user_id);
    `);

    // Index on project_id for fast lookups by project
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_projects_project_id
      ON user_projects(project_id);
    `);

    // Composite index for common queries and date range filtering
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_user_projects_user_date_range
      ON user_projects(user_id, start_date, end_date);
    `);

    // 3️⃣ Create trigger to update updated_at timestamp
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_user_projects_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await pool.query(`
      DROP TRIGGER IF EXISTS trigger_update_user_projects_updated_at ON user_projects;
    `);

    await pool.query(`
      CREATE TRIGGER trigger_update_user_projects_updated_at
      BEFORE UPDATE ON user_projects
      FOR EACH ROW
      EXECUTE FUNCTION update_user_projects_updated_at();
    `);

    console.log("✅ User Projects table & indexes ready");
  } catch (err) {
    console.error("❌ Failed to ensure user_projects table", err);
    throw err;
  }
};

module.exports = { ensureUserProjectsTable };
