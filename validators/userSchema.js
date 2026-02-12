const pool = require("../db");
const ensureUsersTable = async () => {
    try {
        await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          dept TEXT NOT NULL,
          password TEXT,
          role VARCHAR(20) DEFAULT 'employee' CHECK (role IN ('admin', 'employee', 'manager')),
          reporting_manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          is_manager BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      
        // Add password column if it doesn't exist (for existing databases)
        await pool.query(`
          ALTER TABLE users 
          ADD COLUMN IF NOT EXISTS password TEXT,
          ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'employee' CHECK (role IN ('admin', 'employee', 'manager')),
          ADD COLUMN IF NOT EXISTS reporting_manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          ADD COLUMN IF NOT EXISTS is_manager BOOLEAN DEFAULT FALSE;
        `);

        console.log("✅ Users table ready (created if not existed)");
    } catch (err) {
        console.error("❌ Failed to ensure users table", err);
        throw err;
    }
};

module.exports={ensureUsersTable}