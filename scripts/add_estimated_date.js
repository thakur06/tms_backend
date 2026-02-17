const pool = require('../db');

async function runMigration() {
    try {
        await pool.query(`
            ALTER TABLE tickets 
            ADD COLUMN IF NOT EXISTS estimated_date DATE;
        `);
        console.log("Migration successful: Added estimated_date to tickets.");
        process.exit(0);
    } catch (err) {
        console.error("Migration failed:", err);
        process.exit(1);
    }
}

runMigration();
