const pool = require("./db");

async function checkSchema() {
  try {
    console.log("Checking projects table schema...");
    const result = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'projects'
      ORDER BY ordinal_position
    `);
    console.log("Columns in projects table:");
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });
    
    // Also try to select from projects to see current structure
    const sampleResult = await pool.query(`SELECT * FROM projects LIMIT 1`);
    console.log("\nSample row structure:");
    if (sampleResult.rows.length > 0) {
      console.log(Object.keys(sampleResult.rows[0]));
    } else {
      console.log("No rows in projects table");
    }
  } catch (err) {
    console.error("ERROR:", err.message);
  } finally {
    process.exit(0);
  }
}

checkSchema();
