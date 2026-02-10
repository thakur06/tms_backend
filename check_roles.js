const pool = require("./db");

async function checkRoles() {
  try {
    const res = await pool.query("SELECT DISTINCT role FROM users");
    console.log("ROLES:", JSON.stringify(res.rows.map(r => r.role)));
    
    const res2 = await pool.query("SELECT email, role, is_manager FROM users WHERE is_manager = TRUE LIMIT 20");
    console.log("MANAGERS:", JSON.stringify(res2.rows, null, 2));

    const res3 = await pool.query("SELECT role, COUNT(*) FROM users GROUP BY role");
    console.log("STATS:", JSON.stringify(res3.rows, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

checkRoles();
