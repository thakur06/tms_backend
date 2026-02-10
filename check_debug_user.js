const pool = require("./db");

async function debugUser(email) {
  try {
    console.log(`Checking user: ${email}`);
    const result = await pool.query(
        `SELECT 
            u.id, u.name, u.email, u.dept, u.password, u.role, u.is_manager,
            (SELECT COUNT(*) FROM users WHERE reporting_manager_id = u.id) as reports_count
         FROM users u 
         WHERE u.email = $1`,
        [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
        console.log("User not found");
        return; 
    }

    const user = result.rows[0];
    console.log("RAW DB RESULT:", JSON.stringify(user, null, 2));
    
    // Simulate authController logic
    const responseUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        dept: user.dept,
        role: user.role,
        isManager: user.is_manager === true,
        reportsCount: parseInt(user.reports_count) || 0
    };
    
    console.log("AUTH CONTROLLER RESPONSE USER:", JSON.stringify(responseUser, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

debugUser('mkarthick@biogaseng.com');
