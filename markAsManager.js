const pool = require('./db');

async function checkAndUpdateManager() {
  try {
    // Get all users
    const result = await pool.query('SELECT id, name, email, is_manager FROM users ORDER BY id');
    
    console.log('\n=== Current Users ===');
    result.rows.forEach(user => {
      console.log(`ID: ${user.id} | Name: ${user.name} | Email: ${user.email} | Is Manager: ${user.is_manager || false}`);
    });
    
    if (result.rows.length > 0) {
      const firstUser = result.rows[0];
      
      console.log(`\n=== Marking user "${firstUser.name}" (${firstUser.email}) as manager ===`);
      
      await pool.query('UPDATE users SET is_manager = true WHERE id = $1', [firstUser.id]);
      
      console.log('✅ User updated successfully!');
      console.log('\nNow you should see the "Approvals" tab in the sidebar.');
      console.log('Please refresh your browser to see the changes.');
    } else {
      console.log('\n⚠️ No users found in database. Please create a user first.');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkAndUpdateManager();
