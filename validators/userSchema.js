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
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      
        // Add password column if it doesn't exist (for existing databases)
        await pool.query(`
          ALTER TABLE users 
          ADD COLUMN IF NOT EXISTS password TEXT;
        `);

        console.log("✅ Users table ready (created if not existed)");
    } catch (err) {
        console.error("❌ Failed to ensure users table", err);
        throw err;
    }
};

module.exports={ensureUsersTable}