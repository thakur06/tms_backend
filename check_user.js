const pool = require("./db");

async function checkSpecificUser(email) {
  try {
    const res = await pool.query(
        `SELECT id, email, role, is_manager 
         FROM users 
         WHERE email = $1`, 
        [email]
    );
    console.log("USER DATA:", JSON.stringify(res.rows[0], null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

// Check for the user from previous logs if possible, otherwise check a known manager
checkSpecificUser('mkarthick@biogaseng.com');
