const { 
  seedUsersFromExcel, 
  seedClientsFromExcel, 
  seedProjectsFromExcel, 
  seedTasksFromExcel, 
  seedManagersFromExcel 
} = require("./seeds");
const pool = require("./db");

async function runAllSeeds() {
  try {
    console.log("🚀 Starting data seeding process...");
    
    // Order matters if there are foreign keys (Users usually first)
    await seedUsersFromExcel();
    await seedClientsFromExcel();
    await seedProjectsFromExcel();
    await seedTasksFromExcel();
    
    // Finally update rankings/relationships
    await seedManagersFromExcel();
    
    console.log("✅ All seeding completed successfully!");
  } catch (err) {
    console.error("❌ Seeding process failed:", err);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

runAllSeeds();
