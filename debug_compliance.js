const pool = require("./db");

async function debugStatuses() {
  try {
    console.log("Checking timesheet_approvals schema...");
    const schema = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'timesheet_approvals'
    `);
    console.log("Columns:", schema.rows);

    console.log("\nChecking recently submitted timesheets...");
    const data = await pool.query(`
      SELECT user_id, status, week_start_date, week_end_date, total_hours 
      FROM timesheet_approvals 
      ORDER BY id DESC LIMIT 5
    `);
    console.log("Recent records:", data.rows.map(r => ({
      ...r,
      week_start_date: r.week_start_date,
      type_start: typeof r.week_start_date
    })));

    // Let's test a sample query with string matching
    if (data.rows.length > 0) {
        const sample = data.rows[0];
        const start = sample.week_start_date.toISOString().split('T')[0];
        const end = sample.week_end_date.toISOString().split('T')[0];
        console.log(`\nTesting query with params: ${sample.user_id}, ${start}, ${end}`);
        
        const testMatch = await pool.query(`
            SELECT id FROM timesheet_approvals 
            WHERE user_id = $1 AND week_start_date = $2 AND week_end_date = $3
        `, [sample.user_id, start, end]);
        
        console.log("Match found with strings?", testMatch.rows.length > 0);
    }

  } catch (err) {
    console.error("ERROR:", err.message);
  } finally {
    process.exit(0);
  }
}

debugStatuses();
