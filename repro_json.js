const { Pool } = require('pg');

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "TMS",
  password: "admin123",
  port: 5433
});

async function test() {
  const name = 'Repro Case ' + new Date().toISOString();
  const data = [
    { id: Date.now(), items: 'PIPE', class: '300#', spec: 'CS1', size1: '2"', qty: 10, surfaceArea: 123.45, remarks: 'test remarks' }
  ];
  const total_area = 123.45;
  
  try {
    const jsonData = JSON.stringify(data);
    console.log("Stringified Data (Length: " + jsonData.length + "):", jsonData);
    
    const result = await pool.query(
      `INSERT INTO surface_area_calculations (name, data, total_area) 
       VALUES ($1, $2::jsonb, $3) RETURNING *`,
      [name, jsonData, total_area]
    );
    console.log("✅ Success! Inserted ID:", result.rows[0].id);
  } catch (err) {
    console.error("❌ Failed with error:", err.message);
    if (err.detail) console.error("Detail:", err.detail);
    if (err.where) console.error("Where:", err.where);
  } finally {
    await pool.end();
  }
}

test();
