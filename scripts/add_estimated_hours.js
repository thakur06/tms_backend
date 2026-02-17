const pool = require('../db');

async function runMigration() {
    try {
        await pool.query(`
            ALTER TABLE tickets 
            ADD COLUMN IF NOT EXISTS estimated_hours DECIMAL(10, 2) DEFAULT 0;
        `);
        console.log("Migration successful: Added estimated_hours to tickets.");
        process.exit(0);
    } catch (err) {
        console.error("Migration failed:", err);
        process.exit(1);
    }
}

runMigration();
