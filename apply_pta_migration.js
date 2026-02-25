const pool = require("./db");
async function run() {
    try {
        await pool.query("ALTER TABLE user_projects ADD COLUMN IF NOT EXISTS remarks TEXT");
        await pool.query("ALTER TABLE user_projects ADD COLUMN IF NOT EXISTS base_hours INTEGER");
        await pool.query("UPDATE user_projects SET base_hours = allocation_hours WHERE base_hours IS NULL");
        console.log("✅ PTA fields added and initialized");
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
run();
