const pool = require('../db');

async function checkSchema() {
    try {
        const result = await pool.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'tickets'
            AND column_name IN ('estimated_hours', 'status', 'priority', 'assignee_id');
        `);
        console.log("Found Columns:", result.rows);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkSchema();
