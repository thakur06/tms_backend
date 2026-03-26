const { Pool } = require('pg');

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "TMS",
  password: "admin123",
  port: 5433
});

async function test() {
  try {
    const result = await pool.query("SELECT * FROM surface_area_calculations ORDER BY id DESC LIMIT 5");
    console.log("Found " + result.rows.length + " records:");
    result.rows.forEach(row => {
      console.log(`ID: ${row.id}, Name: ${row.name}, Total Area: ${row.total_area}`);
      console.log(`Data Type: ${typeof row.data}, Data content: ${JSON.stringify(row.data).slice(0, 200)}...`);
      console.log("-------------------");
    });
  } catch (err) {
    console.error("❌ Failed with error:", err.message);
  } finally {
    await pool.end();
  }
}

test();
